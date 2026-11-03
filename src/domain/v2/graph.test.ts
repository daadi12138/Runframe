import assert from 'node:assert/strict'
import test from 'node:test'
import { getReadyTaskIds, validatePlanGraph } from './graph'
import type { TaskNode } from './model'

const node = (id: string, dependsOn: string[] = []): Pick<TaskNode, 'id' | 'dependsOn'> => ({ id, dependsOn })

test('validates and deterministically sorts a dependency graph', () => {
  const result = validatePlanGraph([node('c', ['a']), node('b'), node('a')])
  assert.equal(result.valid, true)
  assert.deepEqual(result.topologicalOrder, ['a', 'b', 'c'])
})

test('rejects duplicate IDs, missing dependencies, self edges, and cycles', () => {
  assert.equal(validatePlanGraph([node('a'), node('a')]).valid, false)
  assert.equal(validatePlanGraph([node('a', ['missing'])]).valid, false)
  assert.equal(validatePlanGraph([node('a', ['a'])]).valid, false)
  assert.equal(validatePlanGraph([node('a', ['b']), node('b', ['a'])]).valid, false)
})

test('returns only tasks whose dependencies have succeeded', () => {
  const tasks = [
    { id: 'a', dependsOn: [], status: 'succeeded' },
    { id: 'b', dependsOn: ['a'], status: 'pending' },
    { id: 'c', dependsOn: ['b'], status: 'pending' },
  ] as TaskNode[]
  assert.deepEqual(getReadyTaskIds(tasks), ['b'])
})
