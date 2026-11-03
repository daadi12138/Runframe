import assert from 'node:assert/strict'
import test from 'node:test'
import type { Mission, PlanRevision } from '../../domain/v2/model'
import type { MissionRepository } from '../../ports/v2/mission-repository'
import type { MissionRunDispatchRequest, MissionRunDispatcher } from '../../ports/v2/mission-run-dispatcher'
import { MissionService } from './mission-service'
import { MissionExecutionService } from './mission-execution-service'

class MemoryRepository implements MissionRepository {
  missions = new Map<string, Mission>()
  plans = new Map<string, PlanRevision[]>()
  failMissionSave = false
  async getMission(id: string) { return this.missions.get(id) ?? null }
  async listMissions() { return [...this.missions.values()] }
  async saveMission(mission: Mission) {
    if (this.failMissionSave) throw new Error('disk unavailable')
    this.missions.set(mission.id, mission)
  }
  async getLatestPlan(id: string) { return this.plans.get(id)?.at(-1) ?? null }
  async getPlanRevision(id: string, revision: number) { return this.plans.get(id)?.find(plan => plan.revision === revision) ?? null }
  async savePlan(plan: PlanRevision) { this.plans.set(plan.missionId, [...(this.plans.get(plan.missionId) ?? []), plan]) }
}

class FakeDispatcher implements MissionRunDispatcher {
  request?: MissionRunDispatchRequest
  cancelled: string[] = []
  async dispatch(request: MissionRunDispatchRequest) {
    this.request = request
    return { runId: 'run-v2-test' }
  }
  async getStatus(_runId: string) { return this.status ?? null }
  status: string | null = null
  async cancel(runId: string) { this.cancelled.push(runId) }
}

test('dispatches a validated plan and links the resulting run to the mission', async () => {
  const repository = new MemoryRepository()
  const missionService = new MissionService(repository, () => new Date('2026-01-01T00:00:00.000Z'), () => 'mission-execution')
  const mission = await missionService.create({ title: 'Ship feature', description: 'Implement the feature' })
  const plan = await missionService.savePlan(mission.id, [
    { id: 'build', title: 'Build', status: 'pending', dependsOn: [] },
  ])
  const dispatcher = new FakeDispatcher()
  const execution = new MissionExecutionService(repository, dispatcher, () => new Date('2026-01-02T00:00:00.000Z'))
  const result = await execution.dispatch(mission.id, { executorId: 'codex', executionMode: 'workspace_write' })
  assert.equal(result.runId, 'run-v2-test')
  assert.equal(result.mission.status, 'running')
  assert.equal(result.mission.activeRunId, 'run-v2-test')
  assert.equal(dispatcher.request?.plan.id, plan.id)
  assert.equal(dispatcher.request?.tasks.length, 1)
})

test('cancels a newly created run if mission linkage cannot be persisted', async () => {
  const repository = new MemoryRepository()
  const missionService = new MissionService(repository, () => new Date(), () => 'mission-save-fail')
  const mission = await missionService.create({ title: 'Test' })
  await missionService.savePlan(mission.id, [{ id: 'task', title: 'Task', status: 'pending', dependsOn: [] }])
  const dispatcher = new FakeDispatcher()
  repository.failMissionSave = true
  const execution = new MissionExecutionService(repository, dispatcher)
  await assert.rejects(() => execution.dispatch(mission.id, { executorId: 'codex', executionMode: 'read_only' }), /disk unavailable/)
  assert.deepEqual(dispatcher.cancelled, ['run-v2-test'])
})

test('does not start another run while the previous run is awaiting delivery approval', async () => {
  const repository = new MemoryRepository()
  const missionService = new MissionService(repository, () => new Date(), () => 'mission-overlap')
  const mission = await missionService.create({ title: 'Prevent overlap' })
  await missionService.savePlan(mission.id, [{ id: 'task', title: 'Task', status: 'pending', dependsOn: [] }])
  await repository.saveMission({ ...mission, status: 'review', activeRunId: 'run-pending-delivery' })
  const dispatcher = new FakeDispatcher()
  dispatcher.status = 'awaiting_delivery'
  const execution = new MissionExecutionService(repository, dispatcher)
  await assert.rejects(
    () => execution.dispatch(mission.id, { executorId: 'codex', executionMode: 'read_only' }),
    /still active or awaiting approval/,
  )
  assert.equal(dispatcher.request, undefined)
})

test('serializes concurrent dispatches for one mission to prevent duplicate runs', async () => {
  const repository = new MemoryRepository()
  const missionService = new MissionService(repository, () => new Date(), () => 'mission-dispatch-race')
  const mission = await missionService.create({ title: 'No duplicate dispatch' })
  await missionService.savePlan(mission.id, [{ id: 'task', title: 'Task', status: 'pending', dependsOn: [] }])
  let dispatchCount = 0
  const dispatcher: MissionRunDispatcher = {
    async dispatch() {
      dispatchCount += 1
      await new Promise(resolve => setTimeout(resolve, 5))
      return { runId: `run-${dispatchCount}` }
    },
    async getStatus() { return null },
    async cancel() {},
  }
  const execution = new MissionExecutionService(repository, dispatcher)
  const results = await Promise.allSettled([
    execution.dispatch(mission.id, { executorId: 'codex', executionMode: 'read_only' }),
    execution.dispatch(mission.id, { executorId: 'codex', executionMode: 'read_only' }),
  ])
  assert.equal(dispatchCount, 1)
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter(result => result.status === 'rejected').length, 1)
})
