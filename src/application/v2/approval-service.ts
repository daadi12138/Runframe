import { randomUUID } from 'node:crypto'
import type { Approval, ApprovalScope } from '../../domain/v2/model'
import type { ApprovalRepository } from '../../ports/v2/approval-repository'

const decisionQueues = new Map<string, Promise<unknown>>()

function sameScope(left: ApprovalScope, right: ApprovalScope): boolean {
  return left.action === right.action
    && left.workspaceRoot === right.workspaceRoot
    && left.command === right.command
    && left.inputDigest === right.inputDigest
}

export class ApprovalService {
  constructor(
    private readonly repository: ApprovalRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => `approval-${randomUUID()}`,
  ) {}

  async decide(scope: ApprovalScope, decision: Approval['decision']): Promise<Approval> {
    if (!scope.action.trim() || !scope.workspaceRoot.trim()) throw new Error('Approval action and workspace root are required.')
    const key = JSON.stringify([scope.action, scope.workspaceRoot, scope.command ?? null, scope.inputDigest ?? null])
    const previous = decisionQueues.get(key) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(async () => {
      const latest = await this.latestDecision(scope)
      const requestedAt = this.now()
      const previousTime = latest ? Date.parse(latest.decidedAt) : Number.NEGATIVE_INFINITY
      const decidedAt = requestedAt.getTime() <= previousTime
        ? new Date(previousTime + 1).toISOString()
        : requestedAt.toISOString()
      const approval: Approval = {
        id: this.createId(),
        scope: { ...scope },
        decision,
        decidedAt,
        decidedBy: 'user',
      }
      await this.repository.create(approval)
      return approval
    })
    decisionQueues.set(key, next)
    try {
      return await next
    } finally {
      if (decisionQueues.get(key) === next) decisionQueues.delete(key)
    }
  }

  async latestDecision(scope: ApprovalScope): Promise<Approval | null> {
    const matching = (await this.repository.list(scope.workspaceRoot))
      .filter(approval => sameScope(approval.scope, scope))
      .sort((left, right) => right.decidedAt.localeCompare(left.decidedAt) || right.id.localeCompare(left.id))
    return matching[0] ?? null
  }

  async isGranted(scope: ApprovalScope): Promise<boolean> {
    return (await this.latestDecision(scope))?.decision === 'granted'
  }
}
