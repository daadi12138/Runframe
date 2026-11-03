import { mkdir, open, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Approval } from '../../domain/v2/model'
import type { ApprovalRepository } from '../../ports/v2/approval-repository'

const safeId = (id: string): string => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new Error('Invalid approval ID.')
  return id
}

function validateApprovalRecord(value: unknown, expectedId?: string): Approval {
  if (!value || typeof value !== 'object') throw new Error('Corrupt approval record: expected an object.')
  const approval = value as Partial<Approval>
  if (typeof approval.id !== 'string' || !approval.id.trim() || (expectedId && approval.id !== expectedId)) throw new Error('Corrupt approval record: invalid ID.')
  const scope = approval.scope
  if (!scope || typeof scope.action !== 'string' || !scope.action.trim()
    || typeof scope.workspaceRoot !== 'string' || !scope.workspaceRoot.trim()) {
    throw new Error(`Corrupt approval ${approval.id}: invalid scope.`)
  }
  if (scope.command !== undefined && typeof scope.command !== 'string') throw new Error(`Corrupt approval ${approval.id}: invalid command scope.`)
  if (scope.inputDigest !== undefined && typeof scope.inputDigest !== 'string') throw new Error(`Corrupt approval ${approval.id}: invalid input digest.`)
  if (approval.decision !== 'granted' && approval.decision !== 'denied') throw new Error(`Corrupt approval ${approval.id}: invalid decision.`)
  if (approval.decidedBy !== 'user' || !Number.isFinite(Date.parse(approval.decidedAt ?? ''))) throw new Error(`Corrupt approval ${approval.id}: invalid decision metadata.`)
  return approval as Approval
}

export class FilesystemApprovalRepository implements ApprovalRepository {
  constructor(private readonly rootDirectory: string) {}

  private path(id: string): string {
    return join(this.rootDirectory, 'approvals', `${safeId(id)}.json`)
  }

  async get(approvalId: string): Promise<Approval | null> {
    try {
      return validateApprovalRecord(JSON.parse(await readFile(this.path(approvalId), 'utf8')), approvalId)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async list(workspaceRoot?: string): Promise<Approval[]> {
    const directory = join(this.rootDirectory, 'approvals')
    let files: string[]
    try { files = await readdir(directory) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const records = await Promise.all(files.filter(file => file.endsWith('.json')).map(async file => {
      return validateApprovalRecord(JSON.parse(await readFile(join(directory, file), 'utf8')), file.slice(0, -'.json'.length))
    }))
    return records
      .filter(record => workspaceRoot === undefined || record.scope.workspaceRoot === workspaceRoot)
      .sort((left, right) => left.decidedAt.localeCompare(right.decidedAt))
  }

  async create(approval: Approval): Promise<void> {
    if (!approval.id?.trim() || !approval.scope?.action?.trim() || !approval.scope.workspaceRoot?.trim()) {
      throw new Error('Approval ID, action, and workspace root are required.')
    }
    if (approval.decision !== 'granted' && approval.decision !== 'denied') throw new Error('Approval decision must be granted or denied.')
    if (approval.decidedBy !== 'user') throw new Error('Approval decision actor is invalid.')
    if (!Number.isFinite(Date.parse(approval.decidedAt))) throw new Error('Approval decision timestamp is invalid.')
    if (approval.scope.command !== undefined && typeof approval.scope.command !== 'string') throw new Error('Approval command scope is invalid.')
    if (approval.scope.inputDigest !== undefined && typeof approval.scope.inputDigest !== 'string') throw new Error('Approval input digest scope is invalid.')
    const path = this.path(approval.id)
    await mkdir(join(path, '..'), { recursive: true })
    // Exclusive creation is the immutability boundary: an approval is never updated in place.
    const handle = await open(path, 'wx')
    try {
      await handle.writeFile(`${JSON.stringify(approval, null, 2)}\n`, 'utf8')
      await handle.sync()
    } catch (error) {
      await rm(path, { force: true }).catch(() => undefined)
      throw error
    } finally {
      await handle.close()
    }
    if (process.platform !== 'win32') {
      const directoryHandle = await open(join(path, '..'), 'r')
      try { await directoryHandle.sync() } finally { await directoryHandle.close() }
    }
  }
}

export function createDefaultApprovalRepository(): FilesystemApprovalRepository {
  const stateRoot = process.env.ARTIFACT_STATE_DIR || join(process.cwd(), '.artifact-state')
  return new FilesystemApprovalRepository(join(stateRoot, 'v2'))
}
