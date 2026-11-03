import { createDefaultMissionRepository, getRun, requestDeliveryApproval } from '@artifact/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const repository = createDefaultMissionRepository()
    const mission = await repository.getMission(id)
    if (!mission) return Response.json({ error: 'Mission not found' }, { status: 404 })
    if (!mission.activeRunId) return Response.json({ error: 'Mission has no linked Run' }, { status: 409 })
    const run = await getRun(mission.activeRunId)
    if (!run) return Response.json({ error: 'Linked Run not found' }, { status: 404 })
    if (run.status !== 'succeeded' && run.status !== 'awaiting_delivery') {
      return Response.json({ error: 'Only a successfully completed Run can enter delivery review.' }, { status: 409 })
    }
    const updatedRun = await requestDeliveryApproval(run.id)
    if (!updatedRun) return Response.json({ error: 'Run not found' }, { status: 404 })
    const updatedMission = { ...mission, status: 'review' as const, updatedAt: new Date().toISOString() }
    await repository.saveMission(updatedMission)
    return Response.json({ mission: updatedMission, run: updatedRun }, { status: 201 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
