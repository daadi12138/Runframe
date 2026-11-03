import { createDefaultExecutionEventStore, getRun, projectProcessTree } from '@artifact/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    if (!(await getRun(id))) return Response.json({ error: 'Run not found' }, { status: 404 })
    const store = createDefaultExecutionEventStore()
    const events = await store.read(id, { afterSequence: 0, limit: 100_000 })
    const nodes = projectProcessTree(events)
    return Response.json({ runId: id, nodes, lastSequence: events.at(-1)?.sequence ?? 0 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
