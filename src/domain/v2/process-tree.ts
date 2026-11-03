import type { ProcessTreeNode } from './model'

export interface ProcessTreeValidation {
  valid: boolean
  errors: string[]
}

/**
 * Validates observed process/session parentage independently of the Plan DAG.
 * A missing parent is invalid: silently promoting an orphan to a root would
 * destroy the provenance needed to explain nested agent execution.
 */
export function validateProcessTree(nodes: readonly ProcessTreeNode[]): ProcessTreeValidation {
  const errors: string[] = []
  const byId = new Map<string, ProcessTreeNode>()
  for (const node of nodes) {
    if (!node.id.trim()) errors.push('Process tree node id is required.')
    if (byId.has(node.id)) errors.push(`Duplicate process tree node id: ${node.id}`)
    else byId.set(node.id, node)
    if (!node.runId.trim()) errors.push(`Process tree node "${node.id}" has no run ID.`)
    if (node.sessionId !== undefined && (typeof node.sessionId !== 'string' || !node.sessionId.trim() || node.sessionId.length > 256)) errors.push(`Process tree node "${node.id}" has an invalid session ID.`)
    if (!Number.isFinite(Date.parse(node.startedAt))) errors.push(`Process tree node "${node.id}" has an invalid start time.`)
    if (node.endedAt && !Number.isFinite(Date.parse(node.endedAt))) errors.push(`Process tree node "${node.id}" has an invalid end time.`)
    if (node.exitSignal !== undefined && (typeof node.exitSignal !== 'string' || !node.exitSignal.trim())) errors.push(`Process tree node "${node.id}" has an invalid exit signal.`)
    if (node.endedAt && Date.parse(node.endedAt) < Date.parse(node.startedAt)) {
      errors.push(`Process tree node "${node.id}" ends before it starts.`)
    }
    if (node.kind === 'os_process' || node.kind === 'tool_process') {
      if (node.processId !== undefined && (!Number.isInteger(node.processId) || node.processId <= 0)) {
        errors.push(`Process tree node "${node.id}" has an invalid process ID.`)
      }
    }
  }

  for (const node of nodes) {
    if (!node.parentId) continue
    const parent = byId.get(node.parentId)
    if (!parent) {
      errors.push(`Process tree node "${node.id}" references missing parent "${node.parentId}".`)
      continue
    }
    if (parent.runId !== node.runId) errors.push(`Process tree node "${node.id}" crosses Run boundaries.`)
  }

  const complete = new Set<string>()
  for (const node of nodes) {
    const path = new Set<string>()
    let current: ProcessTreeNode | undefined = node
    while (current) {
      if (path.has(current.id)) {
        errors.push(`Process tree contains a parent cycle at "${current.id}".`)
        break
      }
      if (complete.has(current.id)) break
      path.add(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    for (const id of path) complete.add(id)
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}
