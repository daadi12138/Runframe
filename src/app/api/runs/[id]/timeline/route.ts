import { createDefaultExecutionEventStore, getRun } from '@artifact/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const query = new URL(request.url).searchParams
  const afterSequence = Number(query.get('afterSequence') ?? 0)
  const limit = Number(query.get('limit') ?? 200)
  if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
    return Response.json({ error: 'afterSequence must be a non-negative integer' }, { status: 400 })
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
    return Response.json({ error: 'limit must be between 1 and 1000' }, { status: 400 })
  }
  try {
    if (!(await getRun(id))) return Response.json({ error: 'Run not found' }, { status: 404 })
    const store = createDefaultExecutionEventStore()
    const [events, lastSequence] = await Promise.all([
      store.read(id, { afterSequence, limit }),
      store.lastSequence(id),
    ])
    return Response.json({ runId: id, events, lastSequence, hasMore: events.length > 0 && events.at(-1)!.sequence < lastSequence })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
