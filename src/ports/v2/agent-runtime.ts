import type { AgentCapabilities } from '../../domain/v2/model'

export interface AgentLaunchRequest {
  attemptId: string
  workspaceRoot: string
  prompt: string
  model?: string
  environment?: Record<string, string>
  /** Adapter-private execution context; never supplied by an untrusted renderer. */
  metadata?: unknown
}

export interface AgentSessionHandle {
  sessionId: string
  processId?: number
}

export interface AgentOutputEvent {
  sessionId: string
  stream: 'stdout' | 'stderr' | 'system'
  text: string
  occurredAt: string
  /** Present only when structuredEvents is declared by the runtime. */
  event?: { type: string; payload: unknown }
  /** Absent means usage is unknown; it must never be interpreted as zero. */
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number }
}

export interface AgentRuntime {
  readonly id: string
  readonly capabilities: AgentCapabilities
  launch(request: AgentLaunchRequest): Promise<AgentSessionHandle>
  cancel?(sessionId: string): Promise<void>
  output(sessionId: string, signal?: AbortSignal): AsyncIterable<AgentOutputEvent>
  pause?(sessionId: string): Promise<void>
  resume?(sessionId: string): Promise<void>
  attach?(sessionId: string): Promise<AgentSessionHandle>
  dispose?(): Promise<void>
}

export function assertRuntimeCapability(
  runtime: AgentRuntime,
  capability: keyof AgentCapabilities,
): void {
  if (!runtime.capabilities[capability]) {
    throw new Error(`Agent runtime "${runtime.id}" does not support capability "${capability}".`)
  }
  const operation = capability === 'cancellation' ? runtime.cancel
    : capability === 'pause' ? runtime.pause
    : capability === 'resume' ? runtime.resume
    : capability === 'attach' ? runtime.attach
    : undefined
  if (['cancellation', 'pause', 'resume', 'attach'].includes(capability) && typeof operation !== 'function') {
    throw new Error(`Agent runtime "${runtime.id}" declares "${capability}" but does not implement its operation.`)
  }
}
