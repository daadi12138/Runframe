export type ScheduledNodeState = 'idle' | 'running' | 'waiting' | 'success' | 'failed' | 'cancelled' | 'skipped' | 'paused'

export interface ScheduledNode {
  id: string
  state: ScheduledNodeState
}

export interface SchedulerEdge {
  from: string
  to: string
}

export interface ScheduleInspection<TNode extends ScheduledNode> {
  nextReadyNode: TNode | null
  complete: boolean
  blocked: boolean
  waiting: boolean
}

/** Pure dependency resolver shared by legacy Run execution and V2 planning. */
export function inspectRunSchedule<TNode extends ScheduledNode>(
  nodes: readonly TNode[],
  edges: readonly SchedulerEdge[],
): ScheduleInspection<TNode> {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const nextReadyNode = nodes.find(node =>
    node.state === 'idle'
    && edges.filter(edge => edge.to === node.id).every(edge => byId.get(edge.from)?.state === 'success'),
  ) ?? null
  if (nextReadyNode) return { nextReadyNode, complete: false, blocked: false, waiting: false }

  const complete = nodes.every(node => node.state === 'success' || node.state === 'skipped')
  const waiting = nodes.some(node => node.state === 'waiting' || node.state === 'running')
  return {
    nextReadyNode: null,
    complete,
    blocked: !complete && !waiting,
    waiting,
  }
}
