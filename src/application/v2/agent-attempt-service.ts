import type { AgentLaunchRequest, AgentOutputEvent, AgentRuntime } from '../../ports/v2/agent-runtime'
import { assertRuntimeCapability } from '../../ports/v2/agent-runtime'

export class AgentAttemptService {
  constructor(private readonly resolveRuntime: (runtimeId: string) => AgentRuntime) {}

  async execute<TTrace = unknown, TResult = unknown>(
    runtimeId: string,
    request: AgentLaunchRequest,
    onTrace?: (trace: TTrace) => Promise<void>,
    onOutput?: (output: AgentOutputEvent) => Promise<void>,
  ): Promise<TResult> {
    const runtime = this.resolveRuntime(runtimeId)
    assertRuntimeCapability(runtime, 'streamingOutput')
    const handle = await runtime.launch(request)
    let result: TResult | undefined
    try {
      for await (const output of runtime.output(handle.sessionId)) {
        if (output.event && !runtime.capabilities.structuredEvents) {
          throw new Error(`Agent runtime "${runtimeId}" emitted structured events without declaring structuredEvents support.`)
        }
        if (output.event?.type === 'trace') {
          await onTrace?.(output.event.payload as TTrace)
        } else if (output.event?.type === 'result') {
          result = output.event.payload as TResult
        } else if (!output.event && output.stream !== 'system' && output.text) {
          await onOutput?.(output)
        } else if (output.event?.type === 'error') {
          const payload = output.event.payload as { message?: unknown }
          throw new Error(typeof payload?.message === 'string' ? payload.message : `Agent runtime "${runtimeId}" failed.`)
        }
      }
    } catch (error) {
      // A failed durable trace/output sink must stop the executor, not leave an
      // unobserved child running after the consumer has abandoned its stream.
      if (runtime.capabilities.cancellation && runtime.cancel) {
        try { await runtime.cancel(handle.sessionId) } catch { /* Preserve the original persistence/stream error. */ }
      }
      throw error
    }
    if (result === undefined) throw new Error(`Agent runtime "${runtimeId}" ended without a result event.`)
    return result
  }

  async cancel(runtimeId: string, sessionId: string): Promise<void> {
    const runtime = this.resolveRuntime(runtimeId)
    assertRuntimeCapability(runtime, 'cancellation')
    await runtime.cancel!(sessionId)
  }
}
