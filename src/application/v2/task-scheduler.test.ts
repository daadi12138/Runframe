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

import { validateSchedulerGraph, type ScheduledNode } from './task-scheduler'

const schedulerNode = (id: string, state: ScheduledNode['state'] = 'idle'): ScheduledNode => ({ id, state })

test('rejects duplicate and blank node identifiers', () => {
  assert.throws(() => validateSchedulerGraph([schedulerNode('a'), schedulerNode('a')], []), /Duplicate scheduler node/)
  assert.throws(() => validateSchedulerGraph([schedulerNode(' ')], []), /id is required/)
})

test('rejects unknown, self, duplicate and cyclic edges', () => {
  const nodes = [schedulerNode('a'), schedulerNode('b')]
  assert.throws(() => validateSchedulerGraph(nodes, [{ from: 'missing', to: 'a' }]), /Unknown scheduler edge/)
  assert.throws(() => validateSchedulerGraph(nodes, [{ from: 'a', to: 'a' }]), /self-cycle/)
  assert.throws(() => validateSchedulerGraph(nodes, [{ from: 'a', to: 'b' }, { from: 'a', to: 'b' }]), /Duplicate scheduler edge/)
  assert.throws(() => validateSchedulerGraph(nodes, [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }]), /contains a cycle/)
})

test('resolves a diamond join only after every parent succeeds', () => {
  const edges = [{ from: 'root', to: 'left' }, { from: 'root', to: 'right' }, { from: 'left', to: 'join' }, { from: 'right', to: 'join' }]
  const nodes = [schedulerNode('root', 'success'), schedulerNode('left', 'success'), schedulerNode('right', 'success'), schedulerNode('join')]
  assert.equal(inspectRunSchedule(nodes, edges).nextReadyNode?.id, 'join')
})

test('treats failed and cancelled terminal nodes as blocked, not complete', () => {
  for (const state of ['failed', 'cancelled'] as const) {
    const result = inspectRunSchedule([schedulerNode('terminal', state)], [])
    assert.equal(result.complete, false)
    assert.equal(result.blocked, true)
  }
})

test('rejects malformed dependencies rather than silently blocking the plan', () => {
  assert.throws(() => inspectRunSchedule([schedulerNode('a')], [{ from: 'missing', to: 'a' }]), /Unknown scheduler edge/)
})
