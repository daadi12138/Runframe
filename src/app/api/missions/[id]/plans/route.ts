import { createDefaultMissionRepository, MissionService } from '@artifact/core'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const service = () => new MissionService(createDefaultMissionRepository())

const taskSchema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(240),
  description: z.string().max(8_000).optional(),
  status: z.enum(['pending', 'ready', 'running', 'succeeded', 'failed', 'blocked', 'cancelled']).default('pending'),
  dependsOn: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
  assignedAgentId: z.string().trim().max(120).optional(),
  acceptanceCriteria: z.array(z.string().max(2_000)).max(100).optional(),
})

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const plan = await createDefaultMissionRepository().getLatestPlan(id)
    return plan ? Response.json(plan) : Response.json({ error: 'Plan not found' }, { status: 404 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const body = z.object({ nodes: z.array(taskSchema).min(1).max(200) }).parse(await request.json())
    const plan = await service().savePlan(id, body.nodes)
    return Response.json(plan, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ error: message }, { status: message.includes('not found') ? 404 : 400 })
  }
}
