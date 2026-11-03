import type { ExecutionEvent } from '../../domain/v2/model'

export interface EventAppendOptions {
  /** Stable key used by adapters to make retries idempotent. */
  idempotencyKey?: string
}

export interface EventReadOptions {
  afterSequence?: number
  limit?: number
}

/** Durable event store contract. Implementations must persist before append resolves. */
export interface ExecutionEventStore {
  append<TPayload>(event: ExecutionEvent<TPayload>, options?: EventAppendOptions): Promise<void>
  read(runId: string, options?: EventReadOptions): Promise<ExecutionEvent[]>
  lastSequence(runId: string): Promise<number>
}
