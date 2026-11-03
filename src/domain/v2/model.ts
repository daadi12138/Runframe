/** Runtime-neutral V2 domain contracts. These types do not replace legacy Run manifests. */

export type MissionStatus = 'draft' | 'planned' | 'running' | 'review' | 'delivered' | 'cancelled'
export type TaskStatus = 'pending' | 'ready' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'cancelled'
export type AttemptStatus = 'queued' | 'starting' | 'running' | 'paused' | 'succeeded' | 'failed' | 'interrupted' | 'cancelled'
export type ExecutionEventKind =
  | 'attempt.queued'
  | 'attempt.started'
  | 'attempt.output'
  | 'attempt.completed'
  | 'attempt.failed'
  | 'attempt.interrupted'
  | 'attempt.paused'
  | 'attempt.resumed'
  | 'attempt.process_attached'
  | 'attempt.cancelled'
  | 'session.started'
  | 'session.output'
  | 'session.ended'
  | 'process.started'
  | 'process.exited'
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.denied'
  | 'artifact.created'
  | 'run.created'
  | 'run.state'
  | 'node.state'
  | 'command.executed'
  | 'executor.activity'
  | 'artifact.updated'
  | 'operator.interaction'
  | 'activity'
  | 'error'

export interface AcceptanceCriterion {
  id: string
  description: string
  required: boolean
}

export interface Mission {
  id: string
  title: string
  description: string
  status: MissionStatus
  acceptanceCriteria: AcceptanceCriterion[]
  createdAt: string
  updatedAt: string
  activeRunId?: string
}

export interface TaskNode {
  id: string
  title: string
  description?: string
  status: TaskStatus
  dependsOn: string[]
  assignedAgentId?: string
  acceptanceCriteria?: string[]
}

export interface PlanRevision {
  id: string
  missionId: string
  revision: number
  nodes: TaskNode[]
  createdAt: string
}

export interface AgentCapabilities {
  streamingOutput: boolean
  structuredEvents: boolean
  cancellation: boolean
  pause: boolean
  resume: boolean
  attach: boolean
  usageReporting: boolean
}

export interface AgentProfile {
  id: string
  name: string
  runtime: string
  capabilities: AgentCapabilities
}

export interface NodeAttempt {
  id: string
  runId: string
  taskNodeId: string
  sequence: number
  status: AttemptStatus
  agentId?: string
  sessionId?: string
  startedAt?: string
  finishedAt?: string
  failureReason?: string
}

/** A normalized node in the observed runtime process/session tree. */
export interface ProcessTreeNode {
  id: string
  runId: string
  parentId?: string
  kind: 'agent_session' | 'os_process' | 'tool_process'
  attemptId?: string
  sessionId?: string
  processId?: number
  command?: string
  startedAt: string
  endedAt?: string
  exitCode?: number
}

export interface ExecutionEvent<TPayload = unknown> {
  id: string
  runId: string
  attemptId?: string
  sequence: number
  kind: ExecutionEventKind
  occurredAt: string
  payload: TPayload
}

export interface ApprovalScope {
  action: string
  workspaceRoot: string
  command?: string
  inputDigest?: string
}

export interface Approval {
  id: string
  scope: ApprovalScope
  decision: 'granted' | 'denied'
  decidedAt: string
  decidedBy: 'user'
}

export interface Artifact {
  id: string
  runId: string
  kind: string
  path?: string
  digest?: string
  createdAt: string
}
