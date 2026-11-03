import { createDefaultMissionRepository, startRun } from '@artifact/core'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const requestSchema = z.object({
  executorId: z.enum(['codex', 'claude']),
  executionMode: z.enum(['read_only', 'workspace_write']).default('read_only'),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const body = requestSchema.parse(await request.json())
    const repository = createDefaultMissionRepository()
    const mission = await repository.getMission(id)
    if (!mission) return Response.json({ error: 'Mission not found' }, { status: 404 })
    if (mission.status !== 'planned') {
      return Response.json({ error: `Mission must be planned before dispatch (current: ${mission.status}).` }, { status: 409 })
    }
    const plan = await repository.getLatestPlan(id)
    if (!plan) return Response.json({ error: 'Mission has no saved Plan Revision' }, { status: 409 })

    const nodes = plan.nodes.map(task => ({
      id: task.id,
      kind: 'Agent',
      executorId: task.assignedAgentId || body.executorId,
      prompt: [
        task.title,
        task.description ?? '',
        ...(task.acceptanceCriteria ?? []).map(criterion => `Acceptance criterion: ${criterion}`),
      ].filter(Boolean).join('\n\n'),
      outputType: 'implementation-report',
      executionMode: body.executionMode,
    }))
    const edges = plan.nodes.flatMap(task => task.dependsOn.map(dependency => ({ from: dependency, to: task.id })))
    const run = await startRun({
      nodes,
      edges,
      input: {
        text: [mission.title, mission.description, ...mission.acceptanceCriteria.map(item => `- ${item.description}`)].filter(Boolean).join('\n\n'),
        attachments: [],
      },
    })
    const updatedMission = { ...mission, status: 'running' as const, activeRunId: run.id, updatedAt: new Date().toISOString() }
    await repository.saveMission(updatedMission)
    return Response.json({ mission: updatedMission, run }, { status: 201 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
