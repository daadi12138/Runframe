import assert from 'node:assert/strict'
import test from 'node:test'
import type { MissionRunDispatchRequest } from '../../ports/v2/mission-run-dispatcher'
import { buildMissionRunCommand } from './mission-run-command'

const request = (): MissionRunDispatchRequest => {
  const nodes = [
    { id: 'design', title: 'Design', status: 'pending' as const, dependsOn: [], assignedAgentId: 'claude', acceptanceCriteria: ['API contract'] },
    { id: 'build', title: 'Build', description: 'Implement API', status: 'pending' as const, dependsOn: ['design'] },
  ]
  return {
    missionId: 'mission-1',
    missionTitle: 'Ship API',
    missionDescription: 'Deliver a stable API',
    acceptanceCriteria: [{ id: 'ac-1', description: 'Tests pass', required: true }],
    plan: { id: 'plan-1', missionId: 'mission-1', revision: 3, nodes, createdAt: '2026-01-01T00:00:00.000Z' },
    tasks: nodes,
    executorId: 'codex',
    executionMode: 'workspace_write',
  }
}

test('maps immutable Plan tasks, dependencies, assigned executors, and criteria', () => {
  const command = buildMissionRunCommand(request())
  assert.deepEqual(command.nodes.map(node => [node.id, node.executorId]), [['design', 'claude'], ['build', 'codex']])
  assert.equal(command.nodes[0].prompt, 'Design\n\nAcceptance criterion: API contract')
  assert.deepEqual(command.edges, [{ from: 'design', to: 'build' }])
  assert.match(command.input.text, /Ship API/)
  assert.match(command.input.text, /Tests pass/)
  assert.equal(command.mission.planRevision, 3)
})

test('rejects task lists that drift from the exact immutable Plan Revision', () => {
  const input = request()
  input.tasks = [...input.tasks].reverse()
  assert.throws(() => buildMissionRunCommand(input), /exactly match/)
})

test('rejects a Plan belonging to a different Mission', () => {
  const input = request()
  input.plan = { ...input.plan, missionId: 'mission-other' }
  assert.throws(() => buildMissionRunCommand(input), /provenance/)
})

test('rejects task content changes even when task IDs remain the same', () => {
  const input = request()
  input.tasks = input.tasks.map(task => task.id === 'build' ? { ...task, title: 'Altered title' } : task)
  assert.throws(() => buildMissionRunCommand(input), /exactly match/)
})
