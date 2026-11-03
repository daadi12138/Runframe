import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectRunSchedule } from './task-scheduler'

const edges = [{ from: 'design', to: 'build' }, { from: 'design', to: 'test' }]

test('selects the first ready task in stable plan order', () => {
  const nodes = [
    { id: 'design', state: 'success' as const },
    { id: 'build', state: 'idle' as const },
    { id: 'test', state: 'idle' as const },
  ]
  assert.equal(inspectRunSchedule(nodes, edges).nextReadyNode?.id, 'build')
})

test('waits while dependencies are executing', () => {
  const nodes = [
    { id: 'design', state: 'running' as const },
    { id: 'build', state: 'idle' as const },
  ]
  const schedule = inspectRunSchedule(nodes, [{ from: 'design', to: 'build' }])
  assert.equal(schedule.waiting, true)
  assert.equal(schedule.blocked, false)
})

test('detects completed and blocked graphs', () => {
  assert.equal(inspectRunSchedule([{ id: 'a', state: 'success' as const }], []).complete, true)
  const blocked = inspectRunSchedule([
    { id: 'a', state: 'failed' as const },
    { id: 'b', state: 'idle' as const },
  ], [{ from: 'a', to: 'b' }])
  assert.equal(blocked.blocked, true)
})
