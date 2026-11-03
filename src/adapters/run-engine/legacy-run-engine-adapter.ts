import { cancelRun, startRun } from '../../run-manager'
import type { MissionRunEngine, MissionRunRequest, MissionRunReceipt } from '../../ports/v2/mission-run-engine'

/**
 * Compatibility adapter: V2 Mission/Plan semantics are translated into the
 * existing isolated Run + Git Worktree engine until the native V2 scheduler
 * replaces this bridge.
 */
export class LegacyRunEngineAdapter implements MissionRunEngine {
  async start(request: MissionRunRequest): Promise<MissionRunReceipt> {
    const { mission, plan, executorId, executionMode } = request
    const nodes = plan.nodes.map(task => ({
      id: task.id,
      kind: 'Agent',
      executorId,
      prompt: [
        task.title,
        task.description ?? '',
        ...(task.acceptanceCriteria ?? []).map(criterion => `Acceptance criterion: ${criterion}`),
      ].filter(Boolean).join('\n\n'),
      outputType: 'implementation-report',
      executionMode,
    }))
    const edges = plan.nodes.flatMap(task => task.dependsOn.map(dependency => ({ from: dependency, to: task.id })))
    const run = await startRun({
      nodes,
      edges,
      input: {
        text: [mission.title, mission.description, ...mission.acceptanceCriteria.map(item => `- ${item.description}`)].filter(Boolean).join('\n\n'),
        attachments: [],
      },
      mission: {
        missionId: mission.id,
        missionTitle: mission.title,
        planRevisionId: plan.id,
        planRevision: plan.revision,
      },
    })
    return { id: run.id, status: run.status, snapshot: run }
  }

  async cancel(runId: string): Promise<void> {
    await cancelRun(runId)
  }
}
