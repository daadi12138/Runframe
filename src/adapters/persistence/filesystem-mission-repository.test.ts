import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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

test('rejects corrupted Mission and Plan records during replay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runframe-missions-corrupt-'))
  try {
    const repository = new FilesystemMissionRepository(root)
    const missionDirectory = join(root, 'missions', 'mission-corrupt')
    await mkdir(missionDirectory, { recursive: true })
    await writeFile(join(missionDirectory, 'mission.json'), JSON.stringify({
      id: 'mission-corrupt', title: 'Corrupt', description: '', status: 'unknown',
      acceptanceCriteria: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }))
    await assert.rejects(() => repository.getMission('mission-corrupt'), /invalid status/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects a persisted plan whose revision file and graph disagree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runframe-plan-corrupt-'))
  try {
    const repository = new FilesystemMissionRepository(root)
    const now = new Date().toISOString()
    await repository.saveMission({
      id: 'mission-plan-corrupt', title: 'Plan', description: '', status: 'draft',
      acceptanceCriteria: [], createdAt: now, updatedAt: now,
    })
    const directory = join(root, 'missions', 'mission-plan-corrupt', 'plans')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'revision-1.json'), JSON.stringify({
      id: 'plan-corrupt', missionId: 'mission-plan-corrupt', revision: 2, createdAt: now,
      nodes: [{ id: 'task', title: 'Task', status: 'pending', dependsOn: ['missing'] }],
    }))
    await assert.rejects(() => repository.getLatestPlan('mission-plan-corrupt'), /invalid task node|Plan Revision/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
