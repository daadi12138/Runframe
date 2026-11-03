import assert from 'node:assert/strict'
import test from 'node:test'
import type { Mission, PlanRevision } from '../../domain/v2/model'
import type { MissionRepository } from '../../ports/v2/mission-repository'
import type { MissionRunEngine, MissionRunRequest, MissionRunReceipt } from '../../ports/v2/mission-run-engine'
import { MissionDispatchService } from './mission-dispatch-service'

function fixtures(status: Mission['status'] = 'planned') {
  const mission: Mission = {
    id: 'mission-1', title: 'Ship feature', description: 'Implement feature', status,
    acceptanceCriteria: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const plan: PlanRevision = {
    id: 'plan-1', missionId: mission.id, revision: 1, createdAt: mission.createdAt,
    nodes: [{ id: 'task-1', title: 'Implement', status: 'pending', dependsOn: [] }],
  }
  let saved: Mission | null = null
  const repository: MissionRepository = {
    async getMission(id) { return id === mission.id ? saved ?? mission : null },
    async listMissions() { return [saved ?? mission] },
    async saveMission(value) { saved = value },
    async getLatestPlan(id) { return id === mission.id ? plan : null },
    async savePlan() {},
  }
  let started: MissionRunRequest | null = null
  let cancelled = false
  const receipt: MissionRunReceipt = { id: 'run-1', status: 'preparing', snapshot: { id: 'run-1' } }
  const engine: MissionRunEngine = {
    async start(request) { started = request; return receipt },
    async cancel() { cancelled = true },
  }
  return { mission, plan, repository, engine, receipt, getStarted: () => started, wasCancelled: () => cancelled, getSaved: () => saved }
}

test('dispatches the immutable latest plan and persists its run association', async () => {
  const data = fixtures()
  const service = new MissionDispatchService(data.repository, data.engine, () => new Date('2026-02-01T00:00:00.000Z'))
  const result = await service.dispatch('mission-1', { executorId: 'codex', executionMode: 'workspace_write' })
  assert.equal(data.getStarted()?.plan.id, 'plan-1')
  assert.equal(data.getStarted()?.executorId, 'codex')
  assert.equal(result.mission.status, 'running')
  assert.equal(result.mission.activeRunId, 'run-1')
  assert.equal(data.getSaved()?.updatedAt, '2026-02-01T00:00:00.000Z')
})

test('rejects missing missions, missing plans, and invalid lifecycle states before starting', async () => {
  const missing = fixtures()
  const service = new MissionDispatchService(missing.repository, missing.engine)
  await assert.rejects(() => service.dispatch('unknown', { executorId: 'codex', executionMode: 'read_only' }), /Mission not found/)
  const noPlanRepo: MissionRepository = { ...missing.repository, async getLatestPlan() { return null } }
  await assert.rejects(() => new MissionDispatchService(noPlanRepo, missing.engine).dispatch('mission-1', { executorId: 'codex', executionMode: 'read_only' }), /no saved Plan/)
  const running = fixtures('running')
  await assert.rejects(() => new MissionDispatchService(running.repository, running.engine).dispatch('mission-1', { executorId: 'codex', executionMode: 'read_only' }), /must be planned/)
  assert.equal(running.getStarted(), null)
})

test('cancels the created run if mission association cannot be persisted', async () => {
  const data = fixtures()
  const repository: MissionRepository = { ...data.repository, async saveMission() { throw new Error('disk full') } }
  const service = new MissionDispatchService(repository, data.engine)
  await assert.rejects(() => service.dispatch('mission-1', { executorId: 'claude', executionMode: 'read_only' }), /disk full/)
  assert.equal(data.wasCancelled(), true)
})
