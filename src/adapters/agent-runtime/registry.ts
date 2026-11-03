import type { AgentRuntime } from '../../ports/v2/agent-runtime'

/** Explicit runtime registry; no implicit capability assumptions are made. */
export class AgentRuntimeRegistry {
  private readonly runtimes = new Map<string, AgentRuntime>()

  register(runtime: AgentRuntime): void {
    if (!runtime.id.trim()) throw new Error('Agent runtime ID must not be empty.')
    if (this.runtimes.has(runtime.id)) throw new Error(`Agent runtime already registered: ${runtime.id}`)
    this.runtimes.set(runtime.id, runtime)
  }

  replace(runtime: AgentRuntime): void {
    if (!runtime.id.trim()) throw new Error('Agent runtime ID must not be empty.')
    this.runtimes.set(runtime.id, runtime)
  }

  get(runtimeId: string): AgentRuntime {
    const runtime = this.runtimes.get(runtimeId)
    if (!runtime) throw new Error(`Unknown agent runtime: ${runtimeId}`)
    return runtime
  }

  list(): AgentRuntime[] {
    return [...this.runtimes.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  async dispose(): Promise<void> {
    const runtimes = this.list()
    this.runtimes.clear()
    await Promise.all(runtimes.map(runtime => runtime.dispose?.()))
  }
}
