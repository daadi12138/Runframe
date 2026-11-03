import type { Approval } from '../../domain/v2/model'

export interface ApprovalRepository {
  get(approvalId: string): Promise<Approval | null>
  list(workspaceRoot?: string): Promise<Approval[]>
  create(approval: Approval): Promise<void>
}
