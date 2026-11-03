import { cancelRun, getRun, startRun } from '../../run-manager'
import type { MissionRunDispatcher, MissionRunDispatchRequest } from '../../ports/v2/mission-run-dispatcher'
import { buildMissionRunCommand } from '../../application/v2/mission-run-command'

export class LegacyMissionRunDispatcher implements MissionRunDispatcher {
  async dispatch(request: MissionRunDispatchRequest): Promise<{ runId: string }> {
    const command = buildMissionRunCommand(request)
    const run = await startRun({
      ...command,
    })
    return { runId: run.id }
  }

  async getStatus(runId: string): Promise<string | null> {
    return (await getRun(runId))?.status ?? null
  }

  async cancel(runId: string): Promise<void> {
    await cancelRun(runId)
  }
}
