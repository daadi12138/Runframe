import assert from 'node:assert/strict'
import test from 'node:test'
import { projectProcessTree } from './process-tree-projection'
import type { ExecutionEvent } from '../../domain/v2/model'

const event = (sequence: number, kind: ExecutionEvent['kind'], payload: unknown, overrides: Partial<ExecutionEvent> = {}): ExecutionEvent => ({
  id: `event-${sequence}`,
  runId: 'run-1',
  sequence,
  kind,
  occurredAt: `2026-01-01T00:00:0${sequence}.000Z`,
  payload,
  ...overrides,
})

test('projects nested session and subprocess lifecycle facts', () => {
  const tree = projectProcessTree([
    event(1, 'session.started', { id: 'session', kind: 'agent_session', sessionId: 's-1' }),
    event(2, 'process.started', { id: 'process', parentId: 'session', kind: 'os_process', processId: 321 }),
    event(3, 'process.exited', { id: 'process', signal: 'SIGTERM' }),
    event(4, 'session.ended', { id: 'session' }),
  ])
  assert.equal(tree.length, 2)
  assert.equal(tree.find(item => item.id === 'process')?.parentId, 'session')
  assert.equal(tree.find(item => item.id === 'process')?.exitSignal, 'SIGTERM')
  assert.ok(tree.every(item => item.endedAt))
})

test('rejects duplicate starts, missing terminal targets, and malformed payloads', () => {
  assert.throws(() => projectProcessTree([
    event(1, 'session.started', { id: 's', kind: 'agent_session' }),
    event(2, 'session.started', { id: 's', kind: 'agent_session' }),
  ]), /started more than once/)
  assert.throws(() => projectProcessTree([event(1, 'process.exited', { id: 'missing' })]), /unknown node/)
  assert.throws(() => projectProcessTree([event(1, 'process.started', { id: 'p', kind: 'os_process', processId: -1 })]), /positive integer/)
})

test('rejects invalid sequence ordering and unclosed parent references', () => {
  assert.throws(() => projectProcessTree([
    event(2, 'session.started', { id: 's', kind: 'agent_session' }),
    event(2, 'process.started', { id: 'p', parentId: 's', kind: 'os_process' }),
  ]), /increasing sequence/)
  assert.throws(() => projectProcessTree([
    event(1, 'process.started', { id: 'p', parentId: 'missing', kind: 'os_process' }),
  ]), /missing parent/)
})

test('rejects terminal events with a different run identity', () => {
  assert.throws(() => projectProcessTree([
    event(1, 'session.started', { id: 's', kind: 'agent_session' }),
    event(2, 'session.ended', { id: 's' }, { runId: 'run-2' }),
  ]), /crosses Run boundaries/)
})
