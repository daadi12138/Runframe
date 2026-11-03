import type { MissionRunDispatchRequest } from '../../ports/v2/mission-run-dispatcher'

export interface MissionRunCommand {
  nodes: Array<{
    id: string
    kind: 'Agent'
    executorId: string
    prompt: string
    outputType: 'implementation-report'
    executionMode: 'read_only' | 'workspace_write'
  }>
  edges: Array<{ from: string; to: string }>
  input: { text: string; attachments: [] }
  mission: {
    missionId: string
    missionTitle: string
    planRevisionId: string
    planRevision: number
  }
}

/** Deterministic translation from an immutable Mission Plan to the legacy execution-engine command. */
export function buildMissionRunCommand(request: MissionRunDispatchRequest): MissionRunCommand {
  if (request.plan.missionId !== request.missionId) {
    throw new Error('Mission Plan provenance does not match the dispatch request.')
  }
  const sameTask = (left: MissionRunDispatchRequest['tasks'][number], right: MissionRunDispatchRequest['plan']['nodes'][number]) =>
    left.id === right.id
    && left.title === right.title
    && left.description === right.description
    && left.status === right.status
    && left.assignedAgentId === right.assignedAgentId
    && JSON.stringify(left.dependsOn) === JSON.stringify(right.dependsOn)
    && JSON.stringify(left.acceptanceCriteria ?? []) === JSON.stringify(right.acceptanceCriteria ?? [])
  if (request.tasks.length !== request.plan.nodes.length
    || request.tasks.some((task, index) => !sameTask(task, request.plan.nodes[index]))) {
    throw new Error('Mission dispatch tasks must exactly match the selected Plan Revision.')
  }

  const nodes = request.tasks.map(task => ({
    id: task.id,
    kind: 'Agent' as const,
    executorId: task.assignedAgentId || request.executorId,
    prompt: [
      task.title,
      task.description ?? '',
      ...(task.acceptanceCriteria ?? []).map(criterion => `Acceptance criterion: ${criterion}`),
    ].filter(Boolean).join('\n\n'),
    outputType: 'implementation-report' as const,
    executionMode: request.executionMode,
  }))
  const edges = request.tasks.flatMap(task => task.dependsOn.map(dependency => ({ from: dependency, to: task.id })))
  return {
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
  }
}
