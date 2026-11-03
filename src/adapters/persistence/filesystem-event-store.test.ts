import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { FilesystemExecutionEventStore } from './filesystem-event-store'

test('persists ordered events, supports replay, and deduplicates idempotent retries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runframe-event-store-'))
  try {
    const store = new FilesystemExecutionEventStore({ rootDirectory: root })
    const event = (sequence: number) => ({
      id: `event-${sequence}`, runId: 'run-test', sequence, kind: 'attempt.queued' as const,
      occurredAt: new Date().toISOString(), payload: { sequence },
    })
    await store.append(event(1), { idempotencyKey: 'dispatch-1' })
    await store.append(event(1), { idempotencyKey: 'dispatch-1' })
    await store.append(event(2))
    assert.equal(await store.lastSequence('run-test'), 2)
    assert.deepEqual((await store.read('run-test', { afterSequence: 1 })).map(item => item.sequence), [2])
    await assert.rejects(() => store.append(event(4)), /Expected event sequence 3/)
    await assert.rejects(() => store.append(event(1), { idempotencyKey: 'dispatch-1-other' }), /Expected event sequence 3/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('serializes concurrent appends for a run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runframe-event-concurrency-'))
  try {
    const store = new FilesystemExecutionEventStore({ rootDirectory: root })
    const events = Array.from({ length: 12 }, (_, index) => ({
      id: `event-${index + 1}`, runId: 'run-concurrent', sequence: index + 1,
      kind: 'attempt.output' as const, occurredAt: new Date().toISOString(), payload: null,
    }))
    await Promise.all(events.map(event => store.append(event)))
    assert.equal(await store.lastSequence('run-concurrent'), 12)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
