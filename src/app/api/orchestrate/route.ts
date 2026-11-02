import { NextRequest, NextResponse } from 'next/server'
import {
  decomposeGoal,
  dispatchMissionToRun,
  getActiveMission,
  getKanbanTicketsFromRuns,
  loadMissions,
  replanMissionTickets,
  type ExecutionMode,
  type OrchestratedTicket,
} from '@/agent-orchestrator'
import { approveRun, cancelRun, retryRun } from '@/run-manager'

export async function GET() {
  try {
    const mission = await getActiveMission()
    const runTickets = await getKanbanTicketsFromRuns()
    const allMissions = await loadMissions()

    // If there is an active mission, use its tickets; otherwise fallback to run-derived tickets
    const tickets = mission?.tickets?.length ? mission.tickets : runTickets

    return NextResponse.json({
      mission,
      tickets,
      missions: allMissions,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    if (action === 'decompose') {
      const goal = typeof body.goal === 'string' ? body.goal : '分析并优化当前项目'
      const mode = (body.mode as ExecutionMode) || 'autonomous'
      const mission = await decomposeGoal(goal, mode)
      return NextResponse.json({ mission, tickets: mission.tickets })
    }

    if (action === 'dispatch') {
      const missionId = body.missionId as string
      if (!missionId) {
        // Auto create and dispatch
        const goal = typeof body.goal === 'string' ? body.goal : '执行 Agent 主动编排任务'
        const mode = (body.mode as ExecutionMode) || 'autonomous'
        const newMission = await decomposeGoal(goal, mode)
        const dispatched = await dispatchMissionToRun(newMission.id)
        return NextResponse.json(dispatched)
      }
      const dispatched = await dispatchMissionToRun(missionId)
      return NextResponse.json(dispatched)
    }

    if (action === 'replan') {
      const { missionId, ticketId, reason } = body
      if (!missionId) return NextResponse.json({ error: 'missionId is required' }, { status: 400 })
      const mission = await replanMissionTickets(missionId, ticketId, reason)
      return NextResponse.json({ mission, tickets: mission.tickets })
    }

    if (action === 'approve_gate') {
      const { runId } = body
      if (runId) {
        const approved = await approveRun(runId)
        return NextResponse.json({ success: true, run: approved })
      }
      return NextResponse.json({ success: true })
    }

    if (action === 'retry_ticket') {
      const { runId, nodeId } = body
      if (runId && nodeId) {
        const retried = await retryRun(runId, nodeId)
        return NextResponse.json({ success: true, run: retried })
      }
      return NextResponse.json({ success: true })
    }

    if (action === 'cancel_run') {
      const { runId } = body
      if (runId) {
        const cancelled = await cancelRun(runId)
        return NextResponse.json({ success: true, run: cancelled })
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
