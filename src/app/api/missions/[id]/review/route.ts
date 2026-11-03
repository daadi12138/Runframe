import {
  createDefaultApprovalRepository,
  createDefaultMissionRepository,
  createDefaultExecutionEventStore,
  getRun,
  projectProcessTree,
} from '@artifact/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const repository = createDefaultMissionRepository()
    const mission = await repository.getMission(id)
    if (!mission) return Response.json({ error: 'Mission not found' }, { status: 404 })
    if (!mission.activeRunId) return Response.json({ error: 'Mission has no linked Run to review' }, { status: 409 })

    const run = await getRun(mission.activeRunId)
    if (!run) return Response.json({ error: 'Linked Run not found' }, { status: 404 })
    const runMission = run.mission
    if (!runMission || runMission.missionId !== mission.id) {
      return Response.json({ error: 'Linked Run provenance does not match this Mission.' }, { status: 409 })
    }

    const plan = await repository.getPlanRevision(mission.id, runMission.planRevision)
    if (!plan || plan.id !== runMission.planRevisionId) {
      return Response.json({ error: 'The exact Plan Revision referenced by this Run is missing or inconsistent.' }, { status: 409 })
    }

    const eventStore = createDefaultExecutionEventStore()
    const events = await eventStore.read(run.id)
    const processTree = projectProcessTree(events)
    const approvalRepository = createDefaultApprovalRepository()
    const workspaceApprovals = await Promise.all([
      approvalRepository.list(run.project.gitRoot),
      ...(run.worktreePath && run.worktreePath !== run.project.gitRoot ? [approvalRepository.list(run.worktreePath)] : []),
    ])
    const approvals = [...new Map(workspaceApprovals.flat().map(approval => [approval.id, approval])).values()]
      .sort((left, right) => left.decidedAt.localeCompare(right.decidedAt))

    return Response.json({
      mission,
      plan,
      run: {
        id: run.id,
        status: run.status,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        branchName: run.branchName,
        mission: runMission,
        nodes: run.nodes.map(node => ({
          id: node.id,
          kind: node.kind,
          state: node.state,
          attempts: node.attempts.map(attempt => ({
            id: attempt.id,
            attempt: attempt.attempt,
            executorId: attempt.executorId,
            sessionId: attempt.sessionId,
            status: attempt.status,
            startedAt: attempt.startedAt,
            endedAt: attempt.endedAt,
            process: attempt.process,
            inputArtifactIds: attempt.inputArtifactIds ?? [],
            traceOmittedCount: attempt.traceOmittedCount ?? 0,
          })),
        })),
      },
      evidence: {
        events,
        processTree,
        artifacts: run.artifacts,
        deliveryDiff: run.deliveryApproval?.changes ?? [],
        deliveryApproval: run.deliveryApproval ?? null,
        deliveryReceipt: run.deliveryReceipt ?? null,
        workspaceApprovalDecisions: approvals,
      },
    })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
