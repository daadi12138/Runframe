import type { Mission, PlanRevision } from '../../domain/v2/model'

export interface MissionRepository {
  getMission(missionId: string): Promise<Mission | null>
  listMissions(): Promise<Mission[]>
  saveMission(mission: Mission): Promise<void>
  getLatestPlan(missionId: string): Promise<PlanRevision | null>
  savePlan(plan: PlanRevision): Promise<void>
}
