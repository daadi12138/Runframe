import assert from 'node:assert/strict'
import test from 'node:test'
import { validateProcessTree } from './process-tree'
import type { ProcessTreeNode } from './model'

const node = (id: string, overrides: Partial<ProcessTreeNode> = {}): ProcessTreeNode => ({
  id,
  runId: 'run-1',
  kind: 'agent_session',
  startedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

test('accepts a valid nested session and process tree', () => {
  const result = validateProcessTree([
    node('session'),
    node('process', { parentId: 'session', kind: 'os_process', processId: 123 }),
    node('tool', { parentId: 'process', kind: 'tool_process', processId: 124 }),
  ])
  assert.deepEqual(result, { valid: true, errors: [] })
})

test('rejects duplicate IDs and missing parents', () => {
  const result = validateProcessTree([node('a'), node('a'), node('orphan', { parentId: 'missing' })])
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(error => error.includes('Duplicate')))
  assert.ok(result.errors.some(error => error.includes('missing parent')))
})

test('rejects cross-run parent links and cycles', () => {
  const result = validateProcessTree([
    node('a', { parentId: 'b' }),
    node('b', { parentId: 'a' }),
    node('foreign-parent', { runId: 'run-2' }),
    node('foreign-child', { parentId: 'foreign-parent' }),
  ])
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(error => error.includes('cycle')))
  assert.ok(result.errors.some(error => error.includes('crosses Run boundaries')))
})

test('rejects invalid process IDs and invalid time ranges', () => {
  const result = validateProcessTree([
    node('bad-process', { kind: 'os_process', processId: -1 }),
    node('bad-time', { startedAt: 'not-a-date', endedAt: '2025-01-01T00:00:00.000Z' }),
  ])
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(error => error.includes('invalid process ID')))
  assert.ok(result.errors.some(error => error.includes('invalid start time')))
  assert.ok(result.errors.some(error => error.includes('ends before it starts')))
})
