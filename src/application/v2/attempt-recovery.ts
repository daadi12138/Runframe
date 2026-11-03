import type { ExecutionEvent } from '../../domain/v2/model'

export interface RecoverableAttempt {
  id: string
  status: string
  endedAt?: string
  exitReason?: string
  process?: { pid?: number }
}

export interface RecoverableNode<TAttempt extends RecoverableAttempt = RecoverableAttempt> {
  id: string
  kind: string
  state: string
  attempts: TAttempt[]
}

export interface AttemptRecoveryResult<TNode> {
  nodes: TNode[]
  hasLiveProcess: boolean
  messages: Array<{ nodeId: string; attemptId: string; message: string; kind: 'live' | 'lost' | 'failed' }>
  lostAgentAttemptIds: string[]
}

/** Pure recovery projection from durable attempt facts plus observed OS process liveness. */
export function reconcileInterruptedAttempts<TAttempt extends RecoverableAttempt, TNode extends RecoverableNode<TAttempt>>(
  nodes: readonly TNode[],
  journal: readonly ExecutionEvent[],
  isProcessAlive: (pid: number) => boolean,
  now: string,
): AttemptRecoveryResult<TNode> {
  const latestAttemptEvents = new Map<string, ExecutionEvent>()
  for (const event of journal) {
    if (event.attemptId && event.kind.startsWith('attempt.')) latestAttemptEvents.set(event.attemptId, event)
  }

  let hasLiveProcess = false
  const messages: AttemptRecoveryResult<TNode>['messages'] = []
  const lostAgentAttemptIds: string[] = []
  const recoveredNodes = nodes.map(node => {
    const attempt = node.attempts.at(-1)
    if (!attempt) return node
    const fact = latestAttemptEvents.get(attempt.id)
    const payload = fact?.payload as { process?: { pid?: number }; exitReason?: string } | undefined
    if (fact?.kind === 'attempt.completed') {
      return { ...node, state: 'success', attempts: node.attempts.map(item => item.id === attempt.id ? { ...item, status: 'succeeded', endedAt: fact.occurredAt } as TAttempt : item) } as TNode
    }
    if (fact?.kind === 'attempt.cancelled') {
      return { ...node, state: 'cancelled', attempts: node.attempts.map(item => item.id === attempt.id ? { ...item, status: 'cancelled', endedAt: fact.occurredAt } as TAttempt : item) } as TNode
    }
    if (fact?.kind === 'attempt.failed' || fact?.kind === 'attempt.interrupted') {
      const exitReason = payload?.exitReason ?? 'recovered_failed_attempt'
      messages.push({ nodeId: node.id, attemptId: attempt.id, message: '从事件日志恢复到失败 Attempt，允许重新尝试', kind: 'failed' })
      return { ...node, state: 'idle', attempts: node.attempts.map(item => item.id === attempt.id ? { ...item, status: 'failed', endedAt: fact.occurredAt, exitReason } as TAttempt : item) } as TNode
    }

    const hasActiveFact = fact && ['attempt.started', 'attempt.resumed', 'attempt.process_attached', 'attempt.paused'].includes(fact.kind)
    if (node.state !== 'running' && attempt.status !== 'running' && attempt.status !== 'paused' && !hasActiveFact) return node

    const pid = payload?.process?.pid ?? attempt.process?.pid
    if (pid && isProcessAlive(pid)) {
      hasLiveProcess = true
      messages.push({ nodeId: node.id, attemptId: attempt.id, message: `事件日志确认 PID ${pid} 仍在运行，已暂停以避免重复执行`, kind: 'live' })
      return { ...node, state: 'paused', attempts: node.attempts.map(item => item.id === attempt.id ? { ...item, status: 'paused', endedAt: undefined, exitReason: 'process_still_running' } as TAttempt : item) } as TNode
    }

    messages.push({ nodeId: node.id, attemptId: attempt.id, message: '事件日志未发现存活进程，上一 Attempt 标记为 process_lost', kind: 'lost' })
    if (node.kind === 'Agent') lostAgentAttemptIds.push(attempt.id)
    return { ...node, state: 'idle', attempts: node.attempts.map(item => item.id === attempt.id ? { ...item, status: 'failed', endedAt: now, exitReason: 'process_lost' } as TAttempt : item) } as TNode
  })
  return { nodes: recoveredNodes, hasLiveProcess, messages, lostAgentAttemptIds }
}
