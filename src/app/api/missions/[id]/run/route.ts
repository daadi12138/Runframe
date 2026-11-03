import { createDefaultMissionRepository, getRun, LegacyMissionRunDispatcher, MissionExecutionService } from '@artifact/core'
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
    const service = new MissionExecutionService(
      createDefaultMissionRepository(),
      new LegacyMissionRunDispatcher(),
    )
    const result = await service.dispatch(id, body)
    const run = await getRun(result.runId)
    if (!run) throw new Error('Run manifest was not available after dispatch.')
    return Response.json({ mission: result.mission, run }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ error: message }, { status: message.startsWith('Mission not found:') ? 404 : 400 })
  }
}
