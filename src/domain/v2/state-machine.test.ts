import assert from 'node:assert/strict'
import test from 'node:test'
import { canTransitionMission, transitionAttempt, transitionMission, transitionTask } from './state-machine'

test('allows the documented mission lifecycle and rejects terminal transitions', () => {
  assert.equal(canTransitionMission('draft', 'planned'), true)
  assert.equal(canTransitionMission('delivered', 'running'), false)
  assert.equal(transitionMission('review', 'delivered'), 'delivered')
  assert.throws(() => transitionMission('delivered', 'running'), /Invalid mission transition/)
})

test('enforces task and attempt transitions', () => {
  assert.equal(transitionTask('ready', 'running'), 'running')
  assert.equal(transitionAttempt('starting', 'interrupted'), 'interrupted')
  assert.throws(() => transitionTask('succeeded', 'ready'), /Invalid task transition/)
  assert.throws(() => transitionAttempt('succeeded', 'running'), /Invalid attempt transition/)
})
