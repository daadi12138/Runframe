import { createDefaultMissionRepository, MissionService } from '@artifact/core'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const service = () => new MissionService(createDefaultMissionRepository())

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const mission = await service().get(id)
    return mission ? Response.json(mission) : Response.json({ error: 'Mission not found' }, { status: 404 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const body = z.object({ status: z.enum(['planned', 'running', 'review', 'delivered', 'cancelled']) }).parse(await request.json())
    return Response.json(await service().transition(id, body.status))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ error: message }, { status: message.includes('not found') ? 404 : 400 })
  }
}
