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

/**
 * Validate the scheduler's graph boundary. The resolver is also used by legacy
 * Run manifests, so malformed persisted graphs must fail closed rather than
 * silently leaving nodes permanently blocked.
 */
export function validateSchedulerGraph(nodes: readonly ScheduledNode[], edges: readonly SchedulerEdge[]): void {
  const ids = new Set<string>()
  for (const node of nodes) {
    if (!node.id.trim()) throw new Error('Scheduler node id is required.')
    if (ids.has(node.id)) throw new Error(`Duplicate scheduler node id: ${node.id}`)
    ids.add(node.id)
  }

  const edgeKeys = new Set<string>()
  const incoming = new Map(nodes.map(node => [node.id, 0]))
  const outgoing = new Map(nodes.map(node => [node.id, [] as string[]]))
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error(`Unknown scheduler edge: ${edge.from} -> ${edge.to}`)
    if (edge.from === edge.to) throw new Error(`Scheduler self-cycle: ${edge.from}`)
    const key = `${edge.from}\u0000${edge.to}`
    if (edgeKeys.has(key)) throw new Error(`Duplicate scheduler edge: ${edge.from} -> ${edge.to}`)
    edgeKeys.add(key)
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
    outgoing.get(edge.from)?.push(edge.to)
  }

  const ready = nodes.filter(node => incoming.get(node.id) === 0).map(node => node.id)
  let visited = 0
  while (ready.length) {
    const id = ready.shift()!
    visited += 1
    for (const target of outgoing.get(id) ?? []) {
      const remaining = (incoming.get(target) ?? 1) - 1
      incoming.set(target, remaining)
      if (remaining === 0) ready.push(target)
    }
  }
  if (visited !== nodes.length) throw new Error('Scheduler graph contains a cycle.')
}

/** Pure dependency resolver shared by legacy Run execution and V2 planning. */
export function inspectRunSchedule<TNode extends ScheduledNode>(
  nodes: readonly TNode[],
  edges: readonly SchedulerEdge[],
): ScheduleInspection<TNode> {
  validateSchedulerGraph(nodes, edges)
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
