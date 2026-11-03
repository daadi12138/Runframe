import { cancelRun, createDefaultMissionRepository, getRun, MissionService } from '@artifact/core'
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
      const reconciledStatus = mission.status !== 'running'
        ? mission.status
        : run?.status === 'cancelled'
          ? 'cancelled'
          : run && ['succeeded', 'failed'].includes(run.status)
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
    const body = z.object({ status: z.enum(['planned', 'delivered', 'cancelled']) }).parse(await request.json())
    const repository = createDefaultMissionRepository()
    const mission = await repository.getMission(id)
    if (!mission) return Response.json({ error: 'Mission not found' }, { status: 404 })
    if (body.status === 'delivered') {
      const run = mission.activeRunId ? await getRun(mission.activeRunId) : null
      const approved = run?.status === 'succeeded'
        && !run.deliveryApproval
        && Boolean(run.deliveryReceipt && ['approved', 'no_changes'].includes(run.deliveryReceipt.status))
      if (!approved) return Response.json({ error: 'Mission can be delivered only after the linked Run has passed delivery approval and applied its Worktree changes.' }, { status: 409 })
    }
    if (body.status === 'cancelled' && mission.activeRunId && mission.status === 'running') {
      await cancelRun(mission.activeRunId)
    }
    return Response.json(await service().transition(id, body.status))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ error: message }, { status: message.includes('not found') ? 404 : 400 })
  }
}
