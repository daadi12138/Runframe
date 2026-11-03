import type { AcceptanceCriterion, PlanRevision, TaskNode } from '../../domain/v2/model'

export interface MissionRunDispatchRequest {
  missionId: string
  missionTitle: string
  missionDescription: string
  acceptanceCriteria: AcceptanceCriterion[]
  plan: PlanRevision
  tasks: TaskNode[]
  executorId: string
  executionMode: 'read_only' | 'workspace_write'
}

export interface MissionRunDispatcher {
  dispatch(request: MissionRunDispatchRequest): Promise<{ runId: string }>
  cancel(runId: string): Promise<void>
}
