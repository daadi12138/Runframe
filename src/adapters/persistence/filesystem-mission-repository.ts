import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Mission, PlanRevision } from '../../domain/v2/model'
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
    const latest = await this.getLatestPlan(plan.missionId)
    if (latest && plan.revision <= latest.revision) {
      throw new Error(`Plan revision must increase beyond ${latest.revision}.`)
    }
    const path = join(this.plansDirectory(plan.missionId), `revision-${plan.revision}.json`)
    if (await readJson<PlanRevision>(path)) throw new Error(`Plan revision already exists: ${plan.revision}`)
    await atomicWrite(path, `${JSON.stringify(plan, null, 2)}\n`)
  }
}
