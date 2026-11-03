import type { Mission } from '../../domain/v2/model'
import { validatePlanGraph } from '../../domain/v2/graph'
import { transitionMission } from '../../domain/v2/state-machine'
import type { MissionRepository } from '../../ports/v2/mission-repository'
import type { MissionRunDispatcher } from '../../ports/v2/mission-run-dispatcher'

export interface DispatchMissionOptions {
  executorId: string
  executionMode: 'read_only' | 'workspace_write'
}

export interface DispatchMissionResult {
  mission: Mission
  runId: string
}

export class MissionExecutionService {
  constructor(
    private readonly repository: MissionRepository,
    private readonly dispatcher: MissionRunDispatcher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async dispatch(missionId: string, options: DispatchMissionOptions): Promise<DispatchMissionResult> {
    const mission = await this.repository.getMission(missionId)
    if (!mission) throw new Error(`Mission not found: ${missionId}`)
    if (mission.status !== 'planned' && mission.status !== 'review') {
      throw new Error(`Mission must be planned or in review before dispatch (current: ${mission.status}).`)
    }
    if (mission.activeRunId) {
      const previousRunStatus = await this.dispatcher.getStatus(mission.activeRunId)
      if (!previousRunStatus) throw new Error('The Mission references a Run that cannot be found; refusing to start a second execution.')
      if (!['succeeded', 'failed', 'cancelled'].includes(previousRunStatus)) {
        throw new Error(`The linked Run is still active or awaiting approval (status: ${previousRunStatus}). Resolve it before starting another execution.`)
      }
    }
    const plan = await this.repository.getLatestPlan(missionId)
    if (!plan) throw new Error('Mission has no saved Plan Revision.')
    const graph = validatePlanGraph(plan.nodes)
    if (!graph.valid) throw new Error(`Saved Plan is invalid: ${graph.errors.join('; ')}`)

    const run = await this.dispatcher.dispatch({
      missionId: mission.id,
      missionTitle: mission.title,
      missionDescription: mission.description,
      acceptanceCriteria: mission.acceptanceCriteria,
      plan,
      tasks: plan.nodes,
      executorId: options.executorId,
      executionMode: options.executionMode,
    })
    const updatedMission: Mission = {
      ...mission,
      status: transitionMission(mission.status, 'running'),
      activeRunId: run.runId,
      updatedAt: this.now().toISOString(),
    }
    try {
      await this.repository.saveMission(updatedMission)
    } catch (error) {
      await this.dispatcher.cancel(run.runId).catch(() => undefined)
      throw error
    }
    return { mission: updatedMission, runId: run.runId }
  }
}
