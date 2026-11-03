import { createDefaultMissionRepository, getRun, MissionService } from '@artifact/core'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const service = () => new MissionService(createDefaultMissionRepository())

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const repository = createDefaultMissionRepository()
    let mission = await repository.getMission(id)
    if (!mission) return Response.json({ error: 'Mission not found' }, { status: 404 })
    if (mission.activeRunId) {
      const run = await getRun(mission.activeRunId)
      const reconciledStatus = run?.status === 'cancelled'
        ? 'cancelled'
        : run && ['succeeded', 'failed', 'awaiting_delivery'].includes(run.status)
          ? 'review'
          : mission.status
      if (reconciledStatus !== mission.status) {
        mission = { ...mission, status: reconciledStatus, updatedAt: new Date().toISOString() }
        await repository.saveMission(mission)
      }
    }
    return Response.json(mission)
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
