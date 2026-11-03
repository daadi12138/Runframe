import type { Mission, PlanRevision } from '../../domain/v2/model'

export interface MissionRunRequest {
  mission: Mission
  plan: PlanRevision
  executorId: 'codex' | 'claude'
  executionMode: 'read_only' | 'workspace_write'
}

export interface MissionRunReceipt {
  id: string
  status: string
  snapshot: unknown
}

/** Application-facing boundary to the existing or a future V2 run engine. */
export interface MissionRunEngine {
  start(request: MissionRunRequest): Promise<MissionRunReceipt>
  cancel(runId: string): Promise<void>
}
