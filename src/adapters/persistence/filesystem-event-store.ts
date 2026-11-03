import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExecutionEvent } from '../../domain/v2/model'
import type { EventAppendOptions, EventReadOptions, ExecutionEventStore } from '../../ports/v2/event-store'

interface JournalRecord {
  schemaVersion: 1
  event: ExecutionEvent
  idempotencyKey?: string
}

const safeRunId = (runId: string): string => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(runId)) {
    throw new Error('Invalid run ID for execution journal.')
  }
  return runId
}

const validateEvent = (event: ExecutionEvent): void => {
  if (!event || typeof event !== 'object') throw new Error('Execution event is required.')
  if (!event.id?.trim() || !event.runId?.trim() || !event.kind?.trim()) {
    throw new Error('Execution event id, runId, and kind are required.')
  }
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) {
    throw new Error('Execution event sequence must be a positive safe integer.')
  }
  if (!Number.isFinite(Date.parse(event.occurredAt))) {
    throw new Error('Execution event occurredAt must be a valid ISO timestamp.')
  }
}

export interface FilesystemExecutionEventStoreOptions {
  rootDirectory: string
  lockTimeoutMs?: number
  staleLockMs?: number
}

/**
 * JSONL journal with an fsync-before-return append contract.
 * A per-run exclusive lock serializes writers across processes; the lock is
 * intentionally held only while scanning/appending a single run journal.
 */
export class FilesystemExecutionEventStore implements ExecutionEventStore {
  private readonly rootDirectory: string
  private readonly lockTimeoutMs: number
  private readonly staleLockMs: number

  constructor(options: FilesystemExecutionEventStoreOptions) {
    this.rootDirectory = options.rootDirectory
    this.lockTimeoutMs = options.lockTimeoutMs ?? 30_000
    this.staleLockMs = options.staleLockMs ?? 120_000
  }

  private directory(runId: string): string {
    return join(this.rootDirectory, safeRunId(runId))
  }

  private journalPath(runId: string): string {
    return join(this.directory(runId), 'events.jsonl')
  }

  private async withRunLock<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    const directory = this.directory(runId)
    await mkdir(directory, { recursive: true })
    const lockPath = join(directory, '.write-lock')
    const startedAt = Date.now()
    let acquired = false

    while (!acquired) {
      try {
        await mkdir(lockPath)
        acquired = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        try {
          const lockStat = await stat(lockPath)
          if (Date.now() - lockStat.mtimeMs > this.staleLockMs) {
            await rm(lockPath, { recursive: true, force: true })
            continue
          }
        } catch (statError) {
          if ((statError as NodeJS.ErrnoException).code === 'ENOENT') continue
          throw statError
        }
        if (Date.now() - startedAt >= this.lockTimeoutMs) {
          throw new Error(`Timed out acquiring execution journal lock for run ${runId}.`)
        }
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    }

    try {
      return await operation()
    } finally {
      await rm(lockPath, { recursive: true, force: true })
    }
  }

  private async readRecords(runId: string): Promise<JournalRecord[]> {
    let content: string
    try {
      content = await readFile(this.journalPath(runId), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    if (!content) return []
    const lines = content.split('\n')
    if (lines.at(-1) === '') lines.pop()
    return lines.map((line, index) => {
      try {
        const record = JSON.parse(line) as JournalRecord
        if (record.schemaVersion !== 1 || !record.event) throw new Error('Unsupported journal record schema.')
        validateEvent(record.event)
        if (record.event.runId !== runId) throw new Error('Journal record runId mismatch.')
        return record
      } catch (error) {
        throw new Error(`Corrupt execution journal for run ${runId} at line ${index + 1}: ${(error as Error).message}`)
      }
    })
  }

  async append<TPayload>(event: ExecutionEvent<TPayload>, options: EventAppendOptions = {}): Promise<void> {
    validateEvent(event)
    const runId = safeRunId(event.runId)
    await this.withRunLock(runId, async () => {
      const records = await this.readRecords(runId)
      if (options.idempotencyKey) {
        const existing = records.find(record => record.idempotencyKey === options.idempotencyKey)
        if (existing) {
          if (existing.event.id !== event.id || JSON.stringify(existing.event) !== JSON.stringify(event)) {
            throw new Error(`Idempotency key already used by a different event: ${options.idempotencyKey}`)
          }
          return
        }
      }
      const lastSequence = records.at(-1)?.event.sequence ?? 0
      if (event.sequence !== lastSequence + 1) {
        throw new Error(`Expected event sequence ${lastSequence + 1}, received ${event.sequence}.`)
      }
      if (records.some(record => record.event.id === event.id)) {
        throw new Error(`Duplicate execution event ID: ${event.id}`)
      }
      const record: JournalRecord = {
        schemaVersion: 1,
        event: event as ExecutionEvent,
        ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
      }
      await mkdir(this.directory(runId), { recursive: true })
      const handle = await open(this.journalPath(runId), 'a')
      try {
        await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
    })
  }

  async read(runId: string, options: EventReadOptions = {}): Promise<ExecutionEvent[]> {
    const safeId = safeRunId(runId)
    return this.withRunLock(safeId, async () => {
      const afterSequence = options.afterSequence ?? 0
      const limit = options.limit ?? Number.MAX_SAFE_INTEGER
      if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) throw new Error('afterSequence must be a non-negative safe integer.')
      if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('limit must be a positive safe integer.')
      return (await this.readRecords(safeId))
        .map(record => record.event)
        .filter(event => event.sequence > afterSequence)
        .slice(0, limit)
    })
  }

  async lastSequence(runId: string): Promise<number> {
    const safeId = safeRunId(runId)
    return this.withRunLock(safeId, async () => (await this.readRecords(safeId)).at(-1)?.event.sequence ?? 0)
  }
}

/** Convenient local default; callers may inject a different state directory in tests. */
export function createDefaultExecutionEventStore(): FilesystemExecutionEventStore {
  return new FilesystemExecutionEventStore({
    rootDirectory: join(process.env.ARTIFACT_STATE_DIR || join(process.cwd(), '.artifact-state'), 'v2', 'events'),
  })
}
