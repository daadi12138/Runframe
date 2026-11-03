import type { TaskNode } from './model'

export interface GraphValidation {
  valid: boolean
  errors: string[]
  topologicalOrder: string[]
}

/** Validate and deterministically order a plan graph. Edges point from dependency to dependent. */
export function validatePlanGraph(nodes: readonly Pick<TaskNode, 'id' | 'dependsOn'>[]): GraphValidation {
  const errors: string[] = []
  const byId = new Map<string, Pick<TaskNode, 'id' | 'dependsOn'>>()

  for (const node of nodes) {
    if (!node.id.trim()) errors.push('Task node ID must not be empty.')
    if (byId.has(node.id)) errors.push(`Duplicate task node ID: ${node.id}`)
    byId.set(node.id, node)
  }

  const indegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  for (const id of byId.keys()) {
    indegree.set(id, 0)
    dependents.set(id, [])
  }

  for (const node of byId.values()) {
    const seenDependencies = new Set<string>()
    for (const dependencyId of node.dependsOn) {
      if (seenDependencies.has(dependencyId)) {
        errors.push(`Duplicate dependency ${dependencyId} on task ${node.id}`)
        continue
      }
      seenDependencies.add(dependencyId)
      if (!byId.has(dependencyId)) {
        errors.push(`Task ${node.id} depends on missing task ${dependencyId}`)
        continue
      }
      if (dependencyId === node.id) {
        errors.push(`Task ${node.id} cannot depend on itself`)
        continue
      }
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1)
      dependents.get(dependencyId)?.push(node.id)
    }
  }

  if (errors.length) return { valid: false, errors, topologicalOrder: [] }

  const ready = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id).sort()
  const order: string[] = []
  while (ready.length) {
    const id = ready.shift()
    if (!id) break
    order.push(id)
    for (const dependent of (dependents.get(id) ?? []).sort()) {
      const nextDegree = (indegree.get(dependent) ?? 0) - 1
      indegree.set(dependent, nextDegree)
      if (nextDegree === 0) {
        ready.push(dependent)
        ready.sort()
      }
    }
  }

  if (order.length !== byId.size) {
    return { valid: false, errors: ['Plan graph contains a dependency cycle.'], topologicalOrder: [] }
  }
  return { valid: true, errors: [], topologicalOrder: order }
}

export function getReadyTaskIds(nodes: readonly TaskNode[]): string[] {
  const completed = new Set(nodes.filter(node => node.status === 'succeeded').map(node => node.id))
  return nodes
    .filter(node => node.status === 'pending' || node.status === 'ready')
    .filter(node => node.dependsOn.every(dependencyId => completed.has(dependencyId)))
    .map(node => node.id)
    .sort()
}
