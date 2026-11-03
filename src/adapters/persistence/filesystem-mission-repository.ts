import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Mission, PlanRevision } from '../../domain/v2/model'
import { validatePlanGraph } from '../../domain/v2/graph'
import type { MissionRepository } from '../../ports/v2/mission-repository'

const safeId = (id: string): string => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new Error('Invalid persistence ID.')
  return id
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

const missionStatuses = new Set(['draft', 'planned', 'running', 'review', 'delivered', 'cancelled'])
const taskStatuses = new Set(['pending', 'ready', 'running', 'succeeded', 'failed', 'blocked', 'cancelled'])

function validateMissionRecord(value: unknown, expectedId?: string): Mission {
  if (!value || typeof value !== 'object') throw new Error('Corrupt Mission record: expected an object.')
  const mission = value as Partial<Mission>
  if (typeof mission.id !== 'string' || !mission.id.trim() || (expectedId && mission.id !== expectedId)) throw new Error('Corrupt Mission record: invalid ID.')
  if (typeof mission.title !== 'string' || !mission.title.trim() || typeof mission.description !== 'string') throw new Error(`Corrupt Mission ${mission.id}: invalid title or description.`)
  if (!missionStatuses.has(mission.status ?? '')) throw new Error(`Corrupt Mission ${mission.id}: invalid status.`)
  if (!Array.isArray(mission.acceptanceCriteria)) throw new Error(`Corrupt Mission ${mission.id}: acceptance criteria must be an array.`)
  const criterionIds = new Set<string>()
  for (const criterion of mission.acceptanceCriteria) {
    if (!criterion || typeof criterion.id !== 'string' || !criterion.id.trim() || typeof criterion.description !== 'string' || !criterion.description.trim() || typeof criterion.required !== 'boolean') {
      throw new Error(`Corrupt Mission ${mission.id}: invalid acceptance criterion.`)
    }
    if (criterionIds.has(criterion.id)) throw new Error(`Corrupt Mission ${mission.id}: duplicate acceptance criterion ${criterion.id}.`)
    criterionIds.add(criterion.id)
  }
  if (!Number.isFinite(Date.parse(mission.createdAt ?? '')) || !Number.isFinite(Date.parse(mission.updatedAt ?? ''))) {
    throw new Error(`Corrupt Mission ${mission.id}: invalid timestamps.`)
  }
  if (mission.activeRunId !== undefined && (typeof mission.activeRunId !== 'string' || !mission.activeRunId.trim())) {
    throw new Error(`Corrupt Mission ${mission.id}: invalid active Run reference.`)
  }
  return mission as Mission
}

function validatePlanRecord(value: unknown, expectedMissionId: string): PlanRevision {
  if (!value || typeof value !== 'object') throw new Error('Corrupt Plan Revision: expected an object.')
  const plan = value as Partial<PlanRevision>
  if (typeof plan.id !== 'string' || !plan.id.trim() || plan.missionId !== expectedMissionId) throw new Error('Corrupt Plan Revision: invalid identity.')
  if (!Number.isSafeInteger(plan.revision) || (plan.revision ?? 0) < 1) throw new Error(`Corrupt Plan Revision ${plan.id}: invalid revision.`)
  if (!Number.isFinite(Date.parse(plan.createdAt ?? ''))) throw new Error(`Corrupt Plan Revision ${plan.id}: invalid timestamp.`)
  if (!Array.isArray(plan.nodes) || plan.nodes.length === 0) throw new Error(`Corrupt Plan Revision ${plan.id}: task nodes are required.`)
  for (const node of plan.nodes) {
    if (!node || typeof node.id !== 'string' || !node.id.trim() || typeof node.title !== 'string' || !node.title.trim()
      || !taskStatuses.has(node.status) || !Array.isArray(node.dependsOn) || node.dependsOn.some(id => typeof id !== 'string')) {
      throw new Error(`Corrupt Plan Revision ${plan.id}: invalid task node.`)
    }
    if (node.acceptanceCriteria !== undefined && (!Array.isArray(node.acceptanceCriteria) || node.acceptanceCriteria.some(item => typeof item !== 'string'))) {
      throw new Error(`Corrupt Plan Revision ${plan.id}: invalid task acceptance criteria.`)
    }
  }
  const graph = validatePlanGraph(plan.nodes)
  if (!graph.valid) throw new Error(`Corrupt Plan Revision ${plan.id}: ${graph.errors.join('; ')}`)
  return plan as PlanRevision
}

async function syncDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(path, 'r')
  try { await handle.sync() } finally { await handle.close() }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const directory = join(path, '..')
  await mkdir(directory, { recursive: true })
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' })
    const handle = await open(temporaryPath, 'r')
    try { await handle.sync() } finally { await handle.close() }
    await rename(temporaryPath, path)
    await syncDirectory(directory)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

export class FilesystemMissionRepository implements MissionRepository {
  constructor(private readonly rootDirectory: string) {}

  private missionPath(id: string): string {
    return join(this.rootDirectory, 'missions', safeId(id), 'mission.json')
  }

  private plansDirectory(id: string): string {
    return join(this.rootDirectory, 'missions', safeId(id), 'plans')
  }

  async getMission(missionId: string): Promise<Mission | null> {
    const value = await readJson<unknown>(this.missionPath(missionId))
    return value === null ? null : validateMissionRecord(value, missionId)
  }

  async listMissions(): Promise<Mission[]> {
    const root = join(this.rootDirectory, 'missions')
    let directories: string[]
    try { directories = await readdir(root) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const missions = await Promise.all(directories.map(id => this.getMission(id)))
    return missions.filter((mission): mission is Mission => mission !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async saveMission(mission: Mission): Promise<void> {
    validateMissionRecord(mission, mission.id)
    await atomicWrite(this.missionPath(mission.id), `${JSON.stringify(mission, null, 2)}\\n`)
  }

  async getLatestPlan(missionId: string): Promise<PlanRevision | null> {
    const directory = this.plansDirectory(missionId)
    let files: string[]
    try { files = await readdir(directory) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    const revisions = files
      .map(file => /^revision-(\d+)\.json$/.exec(file))
      .filter((match): match is RegExpExecArray => match !== null)
      .map(match => Number(match[1]))
      .filter(Number.isSafeInteger)
      .sort((left, right) => right - left)
    for (const revision of revisions) {
      const plan = await readJson<unknown>(join(directory, `revision-${revision}.json`))
      if (plan) {
        const validated = validatePlanRecord(plan, missionId)
        if (validated.revision !== revision) throw new Error(`Corrupt Plan Revision ${validated.id}: filename/revision mismatch.`)
        return validated
      }
    }
    return null
  }

  async savePlan(plan: PlanRevision): Promise<void> {
    validatePlanRecord(plan, plan.missionId)
    if (!(await this.getMission(plan.missionId))) throw new Error(`Mission not found: ${plan.missionId}`)
    const latest = await this.getLatestPlan(plan.missionId)
    const expectedRevision = (latest?.revision ?? 0) + 1
    if (plan.revision !== expectedRevision) {
      throw new Error(`Expected plan revision ${expectedRevision}, received ${plan.revision}.`)
    }
    const path = join(this.plansDirectory(plan.missionId), `revision-${plan.revision}.json`)
    await mkdir(this.plansDirectory(plan.missionId), { recursive: true })
    // wx makes each revision immutable even when two callers race to persist it.
    const handle = await open(path, 'wx')
    try {
      await handle.writeFile(`${JSON.stringify(plan, null, 2)}\n`, 'utf8')
      await handle.sync()
    } catch (error) {
      await rm(path, { force: true }).catch(() => undefined)
      throw error
    } finally {
      await handle.close()
    }
    await syncDirectory(this.plansDirectory(plan.missionId))
  }
}
