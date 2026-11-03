import type { ExecutionEvent, ProcessTreeNode } from '../../domain/v2/model'
import { validateProcessTree } from '../../domain/v2/process-tree'

type ProcessStartedPayload = {
  id: string
  parentId?: string
  kind: ProcessTreeNode['kind']
  attemptId?: string
  sessionId?: string
  processId?: number
  command?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStartedPayload(value: unknown): ProcessStartedPayload {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || !['agent_session', 'os_process', 'tool_process'].includes(String(value.kind))) {
    throw new Error('Process start event has an invalid payload.')
  }
  if (value.parentId !== undefined && typeof value.parentId !== 'string') throw new Error('Process parentId must be a string.')
  if (value.attemptId !== undefined && typeof value.attemptId !== 'string') throw new Error('Process attemptId must be a string.')
  if (value.sessionId !== undefined && typeof value.sessionId !== 'string') throw new Error('Process sessionId must be a string.')
  if (value.processId !== undefined && (typeof value.processId !== 'number' || !Number.isInteger(value.processId) || value.processId <= 0)) {
    throw new Error('Process processId must be a positive integer.')
  }
  if (value.command !== undefined && typeof value.command !== 'string') throw new Error('Process command must be a string.')
  return value as ProcessStartedPayload
}

/**
 * Build an observed execution tree from append-only lifecycle facts. Plan
 * dependencies are intentionally not consulted here.
 */
export function projectProcessTree(events: readonly ExecutionEvent[]): ProcessTreeNode[] {
  const nodes = new Map<string, ProcessTreeNode>()
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence)
  let previousSequence = 0
  for (const event of ordered) {
    if (!Number.isInteger(event.sequence) || event.sequence <= previousSequence) {
      throw new Error('Process tree events must have unique, increasing sequence numbers.')
    }
    previousSequence = event.sequence
    if (event.kind === 'session.started' || event.kind === 'process.started') {
      const payload = readStartedPayload(event.payload)
      if (nodes.has(payload.id)) throw new Error(`Process tree node was started more than once: ${payload.id}`)
      nodes.set(payload.id, {
        id: payload.id,
        runId: event.runId,
        parentId: payload.parentId,
        kind: payload.kind,
        attemptId: payload.attemptId ?? event.attemptId,
        sessionId: payload.sessionId,
        processId: payload.processId,
        command: payload.command,
        startedAt: event.occurredAt,
      })
    } else if (event.kind === 'session.output' && isRecord(event.payload) && typeof event.payload.id === 'string' && typeof event.payload.nativeSessionId === 'string') {
      const existing = nodes.get(event.payload.id)
      if (!existing) throw new Error(`Session identity event references unknown node: ${event.payload.id}`)
      if (existing.runId !== event.runId) throw new Error('Session identity event crosses Run boundaries.')
      nodes.set(existing.id, { ...existing, sessionId: event.payload.nativeSessionId })
    } else if (event.kind === 'session.ended' || event.kind === 'process.exited') {
      if (!isRecord(event.payload) || typeof event.payload.id !== 'string') {
        throw new Error('Process terminal event must include a node id.')
      }
      const existing = nodes.get(event.payload.id)
      if (!existing) throw new Error(`Process terminal event references unknown node: ${event.payload.id}`)
      if (existing.runId !== event.runId) throw new Error('Process terminal event crosses Run boundaries.')
      if (existing.endedAt) throw new Error(`Process node already has a terminal event: ${existing.id}`)
      const exitCode = event.payload.exitCode
      const exitSignal = event.payload.signal
      if (exitCode !== undefined && (typeof exitCode !== 'number' || !Number.isInteger(exitCode))) {
        throw new Error('Process exitCode must be an integer.')
      }
      if (exitSignal !== undefined && typeof exitSignal !== 'string') throw new Error('Process exit signal must be a string.')
      nodes.set(existing.id, { ...existing, endedAt: event.occurredAt, exitCode: exitCode as number | undefined, exitSignal: exitSignal as string | undefined })
    }
  }
  const result = [...nodes.values()]
  const validation = validateProcessTree(result)
  if (!validation.valid) throw new Error(`Invalid projected process tree: ${validation.errors.join('; ')}`)
  return result
}
