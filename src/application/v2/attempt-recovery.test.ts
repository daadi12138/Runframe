import assert from 'node:assert/strict'
import test from 'node:test'
import type { ExecutionEvent } from '../../domain/v2/model'
import { reconcileInterruptedAttempts } from './attempt-recovery'

const event = (kind: ExecutionEvent['kind'], attemptId: string, payload: unknown = {}): ExecutionEvent => ({
  id: `event-${kind}`,
  runId: 'run-1',
  attemptId,
  sequence: 1,
  kind,
  occurredAt: '2026-01-01T00:00:00.000Z',
  payload,
})

test('recovers terminal attempt facts without launching duplicate work', () => {
  const nodes = [{ id: 'task', kind: 'Agent', state: 'running', attempts: [{ id: 'attempt-1', status: 'running' }] }]
  const result = reconcileInterruptedAttempts(nodes, [event('attempt.completed', 'attempt-1')], () => false, '2026-01-02T00:00:00.000Z')
  assert.equal(result.nodes[0].state, 'success')
  assert.equal(result.nodes[0].attempts[0].status, 'succeeded')
  assert.equal(result.hasLiveProcess, false)
})

test('pauses an Attempt when its persisted process is still alive', () => {
  const nodes = [{ id: 'task', kind: 'Agent', state: 'running', attempts: [{ id: 'attempt-1', status: 'running', process: { pid: 42 } }] }]
  const result = reconcileInterruptedAttempts(nodes, [event('attempt.started', 'attempt-1')], pid => pid === 42, '2026-01-02T00:00:00.000Z')
  assert.equal(result.nodes[0].state, 'paused')
  assert.equal(result.nodes[0].attempts[0].status, 'paused')
  assert.equal(result.hasLiveProcess, true)
})

test('marks a lost Agent process failed and requests a visible trace', () => {
  const nodes = [{ id: 'task', kind: 'Agent', state: 'running', attempts: [{ id: 'attempt-1', status: 'running', process: { pid: 42 } }] }]
  const result = reconcileInterruptedAttempts(nodes, [event('attempt.started', 'attempt-1')], () => false, '2026-01-02T00:00:00.000Z')
  assert.equal(result.nodes[0].state, 'idle')
  assert.equal(result.nodes[0].attempts[0].exitReason, 'process_lost')
  assert.deepEqual(result.lostAgentAttemptIds, ['attempt-1'])
})
