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

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' })
    const { open } = await import('node:fs/promises')
    const handle = await open(temporaryPath, 'r')
    try { await handle.sync() } finally { await handle.close() }
    await rename(temporaryPath, path)
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
    return readJson<Mission>(this.missionPath(missionId))
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
    if (!mission.id?.trim() || !mission.title?.trim()) throw new Error('Mission ID and title are required.')
    if (!Number.isFinite(Date.parse(mission.createdAt)) || !Number.isFinite(Date.parse(mission.updatedAt))) {
      throw new Error('Mission timestamps must be valid dates.')
    }
    await atomicWrite(this.missionPath(mission.id), `${JSON.stringify(mission, null, 2)}\n`)
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
      const plan = await readJson<PlanRevision>(join(directory, `revision-${revision}.json`))
      if (plan) return plan
    }
    return null
  }

  async savePlan(plan: PlanRevision): Promise<void> {
    if (!plan.id?.trim() || !plan.missionId?.trim()) throw new Error('Plan and mission IDs are required.')
    if (!Number.isSafeInteger(plan.revision) || plan.revision < 1) throw new Error('Plan revision must be a positive integer.')
    if (!(await this.getMission(plan.missionId))) throw new Error(`Mission not found: ${plan.missionId}`)
    const graph = validatePlanGraph(plan.nodes)
    if (!graph.valid) throw new Error(`Invalid plan graph: ${graph.errors.join('; ')}`)
    if (!Number.isFinite(Date.parse(plan.createdAt))) throw new Error('Plan createdAt must be a valid date.')
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
  }
}
