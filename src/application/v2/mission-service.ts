import { randomUUID } from 'node:crypto'
import type { AcceptanceCriterion, Mission, MissionStatus, PlanRevision, TaskNode } from '../../domain/v2/model'
import { validatePlanGraph } from '../../domain/v2/graph'
import { transitionMission } from '../../domain/v2/state-machine'
import type { MissionRepository } from '../../ports/v2/mission-repository'

export interface CreateMissionInput {
  title: string
  description?: string
  acceptanceCriteria?: AcceptanceCriterion[]
}

export class MissionService {
  constructor(
    private readonly repository: MissionRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => `mission-${randomUUID()}`,
  ) {}

  async create(input: CreateMissionInput): Promise<Mission> {
    const title = input.title.trim()
    if (!title) throw new Error('Mission title is required.')
    const timestamp = this.now().toISOString()
    const mission: Mission = {
      id: this.createId(),
      title,
      description: input.description?.trim() ?? '',
      status: 'draft',
      acceptanceCriteria: (input.acceptanceCriteria ?? []).map(criterion => ({ ...criterion })),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.repository.saveMission(mission)
    return mission
  }

  get(missionId: string): Promise<Mission | null> {
    return this.repository.getMission(missionId)
  }

  list(): Promise<Mission[]> {
    return this.repository.listMissions()
  }

  async transition(missionId: string, nextStatus: MissionStatus): Promise<Mission> {
    const mission = await this.repository.getMission(missionId)
    if (!mission) throw new Error(`Mission not found: ${missionId}`)
    const updated: Mission = {
      ...mission,
      status: transitionMission(mission.status, nextStatus),
      updatedAt: this.now().toISOString(),
    }
    await this.repository.saveMission(updated)
    return updated
  }

  async savePlan(missionId: string, nodes: TaskNode[]): Promise<PlanRevision> {
    const mission = await this.repository.getMission(missionId)
    if (!mission) throw new Error(`Mission not found: ${missionId}`)
    if (mission.status !== 'draft' && mission.status !== 'planned' && mission.status !== 'review') {
      throw new Error(`Cannot revise a plan while mission is ${mission.status}.`)
    }
    const graph = validatePlanGraph(nodes)
    if (!graph.valid) throw new Error(`Invalid plan graph: ${graph.errors.join('; ')}`)
    const latest = await this.repository.getLatestPlan(missionId)
    const plan: PlanRevision = {
      id: `plan-${randomUUID()}`,
      missionId,
      revision: (latest?.revision ?? 0) + 1,
      nodes: nodes.map(node => ({ ...node, dependsOn: [...node.dependsOn] })),
      createdAt: this.now().toISOString(),
    }
    await this.repository.savePlan(plan)
    if (mission.status === 'draft') {
      await this.repository.saveMission({
        ...mission,
        status: transitionMission(mission.status, 'planned'),
        updatedAt: this.now().toISOString(),
      })
    }
    return plan
  }
}
