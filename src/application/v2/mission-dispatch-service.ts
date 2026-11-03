import type { Mission, PlanRevision } from '../../domain/v2/model'
import { transitionMission } from '../../domain/v2/state-machine'
import type { MissionRepository } from '../../ports/v2/mission-repository'
import type { MissionRunEngine, MissionRunReceipt } from '../../ports/v2/mission-run-engine'

export interface DispatchMissionInput {
  executorId: 'codex' | 'claude'
  executionMode: 'read_only' | 'workspace_write'
}

export class MissionDispatchService {
  constructor(
    private readonly repository: MissionRepository,
    private readonly engine: MissionRunEngine,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async dispatch(missionId: string, input: DispatchMissionInput): Promise<{ mission: Mission; plan: PlanRevision; run: MissionRunReceipt }> {
    const mission = await this.repository.getMission(missionId)
    if (!mission) throw new Error(`Mission not found: ${missionId}`)
    if (mission.status !== 'planned' && mission.status !== 'review') {
      throw new Error(`Mission must be planned or in review before dispatch (current: ${mission.status}).`)
    }
    const plan = await this.repository.getLatestPlan(missionId)
    if (!plan) throw new Error('Mission has no saved Plan Revision.')
    const run = await this.engine.start({ mission, plan, ...input })
    const updatedMission: Mission = {
      ...mission,
      status: transitionMission(mission.status, 'running'),
      activeRunId: run.id,
      updatedAt: this.now().toISOString(),
    }
    try {
      await this.repository.saveMission(updatedMission)
    } catch (error) {
      await this.engine.cancel(run.id).catch(() => undefined)
      throw error
    }
    return { mission: updatedMission, plan, run }
  }
}
