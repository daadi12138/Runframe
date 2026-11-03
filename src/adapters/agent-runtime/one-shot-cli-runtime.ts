import type { AgentCapabilities } from '../../domain/v2/model'
import type { AgentLaunchRequest, AgentOutputEvent, AgentRuntime, AgentSessionHandle } from '../../ports/v2/agent-runtime'

type OutputQueue = {
  push(event: AgentOutputEvent): void
  close(): void
  iterate(signal?: AbortSignal): AsyncIterable<AgentOutputEvent>
}

function createOutputQueue(): OutputQueue {
  const values: AgentOutputEvent[] = []
  const waiters: Array<(value: IteratorResult<AgentOutputEvent>) => void> = []
  let closed = false
  return {
    push(event) {
      if (closed) return
      const waiter = waiters.shift()
      if (waiter) waiter({ value: event, done: false })
      else values.push(event)
    },
    close() {
      closed = true
      while (waiters.length) waiters.shift()?.({ value: undefined, done: true })
    },
    async *iterate(signal) {
      while (true) {
        if (signal?.aborted) return
        if (values.length) {
          yield values.shift()!
          continue
        }
        if (closed) return
        const next = await new Promise<IteratorResult<AgentOutputEvent>>(resolve => waiters.push(resolve))
        if (next.done) return
        yield next.value
      }
    },
  }
}

/**
 * Bridges existing one-shot Codex/Claude CLI runners into the session-oriented
 * AgentRuntime port. It intentionally does not claim attach, pause, or resume.
 */
export class OneShotCliAgentRuntime implements AgentRuntime {
  readonly capabilities: AgentCapabilities = {
    streamingOutput: true,
    structuredEvents: true,
    cancellation: true,
    pause: false,
    resume: false,
    attach: false,
    usageReporting: false,
  }
  private readonly sessions = new Map<string, OutputQueue>()

  constructor(
    readonly id: string,
    private readonly execute: (
      request: AgentLaunchRequest,
      emit: (event: AgentOutputEvent) => void,
    ) => Promise<unknown>,
    private readonly cancelExecution: (sessionId: string) => Promise<void>,
  ) {}

  async launch(request: AgentLaunchRequest): Promise<AgentSessionHandle> {
    if (!request.attemptId.trim()) throw new Error('Agent Runtime requires an Attempt ID.')
    if (this.sessions.has(request.attemptId)) throw new Error(`Runtime session already exists: ${request.attemptId}`)
    const queue = createOutputQueue()
    this.sessions.set(request.attemptId, queue)
    void this.execute(request, event => queue.push(event))
      .then(result => queue.push({
        sessionId: request.attemptId,
        stream: 'system',
        text: 'Agent execution completed.',
        occurredAt: new Date().toISOString(),
        event: { type: 'result', payload: result },
      }))
      .catch(error => queue.push({
        sessionId: request.attemptId,
        stream: 'system',
        text: error instanceof Error ? error.message : String(error),
        occurredAt: new Date().toISOString(),
        event: { type: 'error', payload: { message: error instanceof Error ? error.message : String(error) } },
      }))
      .finally(() => queue.close())
    return { sessionId: request.attemptId }
  }

  async cancel(sessionId: string): Promise<void> {
    if (!this.sessions.has(sessionId)) return
    await this.cancelExecution(sessionId)
  }

  output(sessionId: string, signal?: AbortSignal): AsyncIterable<AgentOutputEvent> {
    const queue = this.sessions.get(sessionId)
    if (!queue) throw new Error(`Unknown runtime session: ${sessionId}`)
    return queue.iterate(signal)
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map(id => this.cancelExecution(id).catch(() => undefined)))
    this.sessions.clear()
  }
}
