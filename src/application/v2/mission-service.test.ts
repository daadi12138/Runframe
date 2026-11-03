import assert from 'node:assert/strict'
import test from 'node:test'
import type { Mission, PlanRevision } from '../../domain/v2/model'
import type { MissionRepository } from '../../ports/v2/mission-repository'
import { MissionService } from './mission-service'

class MemoryMissionRepository implements MissionRepository {
  missions = new Map<string, Mission>()
  plans = new Map<string, PlanRevision[]>()
  async getMission(id: string) { return this.missions.get(id) ?? null }
  async listMissions() { return [...this.missions.values()] }
  async saveMission(mission: Mission) { this.missions.set(mission.id, mission) }
  async getLatestPlan(id: string) { return this.plans.get(id)?.at(-1) ?? null }
  async savePlan(plan: PlanRevision) { this.plans.set(plan.missionId, [...(this.plans.get(plan.missionId) ?? []), plan]) }
}

test('creates a mission and advances it to planned when a valid plan is saved', async () => {
  const repository = new MemoryMissionRepository()
  const service = new MissionService(repository, () => new Date('2026-01-01T00:00:00.000Z'), () => 'mission-test')
  const mission = await service.create({ title: '  Ship feature  ', description: 'scope' })
  assert.equal(mission.title, 'Ship feature')
  const plan = await service.savePlan(mission.id, [
    { id: 'design', title: 'Design', status: 'pending', dependsOn: [] },
    { id: 'build', title: 'Build', status: 'pending', dependsOn: ['design'] },
  ])
  assert.equal(plan.revision, 1)
  assert.equal((await service.get(mission.id))?.status, 'planned')
})

test('rejects invalid plans and illegal mission transitions', async () => {
  const repository = new MemoryMissionRepository()
  const service = new MissionService(repository, () => new Date(), () => 'mission-invalid')
  const mission = await service.create({ title: 'Test' })
  await assert.rejects(() => service.savePlan(mission.id, []), /at least one task node/)
  await assert.rejects(() => service.savePlan(mission.id, [
    { id: 'a', title: 'A', status: 'pending', dependsOn: ['missing'] },
  ]), /Invalid plan graph/)
  await assert.rejects(() => service.transition(mission.id, 'delivered'), /Invalid mission transition/)
})

test('normalizes plan task identifiers and rejects blank criteria', async () => {
  const repository = new MemoryMissionRepository()
  const service = new MissionService(repository, () => new Date(), () => 'mission-normalize')
  const mission = await service.create({
    title: 'Normalize',
    acceptanceCriteria: [{ id: ' criterion ', description: ' Must work ', required: true }],
  })
  assert.deepEqual(mission.acceptanceCriteria, [{ id: 'criterion', description: 'Must work', required: true }])
  const plan = await service.savePlan(mission.id, [
    { id: ' task-a ', title: ' Task A ', status: 'pending', dependsOn: [], acceptanceCriteria: [' criterion '] },
  ])
  assert.equal(plan.nodes[0].id, 'task-a')
  assert.deepEqual(plan.nodes[0].acceptanceCriteria, ['criterion'])
  await assert.rejects(() => service.savePlan(mission.id, [
    { id: 'task-b', title: 'Task B', status: 'pending', dependsOn: [], acceptanceCriteria: ['   '] },
  ]), /must not be empty/)
})
