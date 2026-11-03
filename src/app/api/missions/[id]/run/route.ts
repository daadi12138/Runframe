import { createDefaultMissionRepository, LegacyRunEngineAdapter, MissionDispatchService } from '@artifact/core'
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
    const service = new MissionDispatchService(createDefaultMissionRepository(), new LegacyRunEngineAdapter())
    const result = await service.dispatch(id, body)
    return Response.json({ mission: result.mission, plan: result.plan, run: result.run.snapshot }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.startsWith('Mission not found:') ? 404
      : message.includes('must be planned') || message.includes('no saved Plan') ? 409
        : 400
    return Response.json({ error: message }, { status })
  }
}
