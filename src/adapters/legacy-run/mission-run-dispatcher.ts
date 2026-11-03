import { cancelRun, getRun, startRun } from '../../run-manager'
import type { MissionRunDispatcher, MissionRunDispatchRequest } from '../../ports/v2/mission-run-dispatcher'

export class LegacyMissionRunDispatcher implements MissionRunDispatcher {
  async dispatch(request: MissionRunDispatchRequest): Promise<{ runId: string }> {
    const nodes = request.tasks.map(task => ({
      id: task.id,
      kind: 'Agent',
      executorId: request.executorId,
      prompt: [
        task.title,
        task.description ?? '',
        ...(task.acceptanceCriteria ?? []).map(criterion => `Acceptance criterion: ${criterion}`),
      ].filter(Boolean).join('\n\n'),
      outputType: 'implementation-report',
      executionMode: request.executionMode,
    }))
    const edges = request.tasks.flatMap(task => task.dependsOn.map(dependency => ({ from: dependency, to: task.id })))
    const run = await startRun({
      nodes,
      edges,
      input: {
        text: [request.missionTitle, request.missionDescription, ...request.acceptanceCriteria.map(item => `- ${item.description}`)].filter(Boolean).join('\n\n'),
        attachments: [],
      },
      mission: {
        missionId: request.missionId,
        missionTitle: request.missionTitle,
        planRevisionId: request.plan.id,
        planRevision: request.plan.revision,
      },
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
