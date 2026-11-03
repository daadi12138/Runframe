import type { Mission, MissionStatus } from '../../domain/v2/model'

export type LinkedRunStatus =
  | 'preparing' | 'running' | 'paused' | 'awaiting_input' | 'awaiting_approval'
  | 'awaiting_delivery' | 'succeeded' | 'failed' | 'cancelled'

export interface MissionRunLink {
  id: string
  status: LinkedRunStatus
}

export function reconcileMissionRun(mission: Mission, run: MissionRunLink): Mission {
  if (mission.status === 'delivered' || mission.status === 'cancelled') return mission
  const status: MissionStatus = run.status === 'cancelled'
    ? 'cancelled'
    : run.status === 'succeeded' || run.status === 'failed' || run.status === 'awaiting_delivery'
      ? 'review'
      : 'running'
  if (mission.activeRunId === run.id && mission.status === status) return mission
  return {
    ...mission,
    activeRunId: run.id,
    status,
    updatedAt: new Date().toISOString(),
  }
}
