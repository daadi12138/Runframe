import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { FilesystemMissionRepository } from './filesystem-mission-repository'

test('persists missions and immutable, validated plan revisions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runframe-missions-'))
  try {
    const repository = new FilesystemMissionRepository(root)
    const now = new Date().toISOString()
    const mission = {
      id: 'mission-demo', title: 'Demo', description: 'Test mission', status: 'draft' as const,
      acceptanceCriteria: [], createdAt: now, updatedAt: now,
    }
    await repository.saveMission(mission)
    assert.deepEqual(await repository.getMission(mission.id), mission)
    const plan = {
      id: 'plan-1', missionId: mission.id, revision: 1, createdAt: now,
      nodes: [{ id: 'task-a', title: 'A', status: 'pending' as const, dependsOn: [] }],
    }
    await repository.savePlan(plan)
    assert.deepEqual(await repository.getLatestPlan(mission.id), plan)
    await assert.rejects(() => repository.savePlan(plan), /Expected plan revision 2/)
    await assert.rejects(() => repository.savePlan({
      ...plan, id: 'plan-invalid', revision: 2,
      nodes: [{ id: 'task-a', title: 'A', status: 'pending', dependsOn: ['missing'] }],
    }), /Invalid plan graph/)
    assert.deepEqual(await repository.listMissions(), [mission])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
