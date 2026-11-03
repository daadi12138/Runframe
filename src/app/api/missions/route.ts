import { createDefaultMissionRepository, MissionService } from '@artifact/core'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const criteriaSchema = z.array(z.object({
  id: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2_000),
  required: z.boolean().default(true),
})).max(100)

const service = () => new MissionService(createDefaultMissionRepository())

export async function GET() {
  try {
    return Response.json(await service().list())
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = z.object({
      title: z.string().trim().min(1).max(240),
      description: z.string().max(20_000).optional(),
      acceptanceCriteria: criteriaSchema.optional(),
    }).parse(await request.json())
    return Response.json(await service().create(body), { status: 201 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
