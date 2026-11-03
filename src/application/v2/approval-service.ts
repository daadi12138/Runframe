import { randomUUID } from 'node:crypto'
import type { Approval, ApprovalScope } from '../../domain/v2/model'
import type { ApprovalRepository } from '../../ports/v2/approval-repository'

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
    const approval: Approval = {
      id: this.createId(),
      scope: { ...scope },
      decision,
      decidedAt: this.now().toISOString(),
      decidedBy: 'user',
    }
    await this.repository.create(approval)
    return approval
  }

  async isGranted(scope: ApprovalScope): Promise<boolean> {
    const matching = (await this.repository.list(scope.workspaceRoot))
      .filter(approval => sameScope(approval.scope, scope))
      .sort((left, right) => right.decidedAt.localeCompare(left.decidedAt) || right.id.localeCompare(left.id))
    return matching[0]?.decision === 'granted'
  }
}
