import type { AgentRuntime } from '../../ports/v2/agent-runtime'

/** Explicit runtime registry; no implicit capability assumptions are made. */
export class AgentRuntimeRegistry {
  private readonly runtimes = new Map<string, AgentRuntime>()

  register(runtime: AgentRuntime): void {
    this.validateRuntime(runtime)
    if (this.runtimes.has(runtime.id)) throw new Error(`Agent runtime already registered: ${runtime.id}`)
    this.runtimes.set(runtime.id, runtime)
  }

  replace(runtime: AgentRuntime): void {
    this.validateRuntime(runtime)
    this.runtimes.set(runtime.id, runtime)
  }

  private validateRuntime(runtime: AgentRuntime): void {
    if (!runtime.id.trim()) throw new Error('Agent runtime ID must not be empty.')
    if (runtime.capabilities.pause && !runtime.pause) {
      throw new Error(`Runtime "${runtime.id}" declares pause support without implementing pause().`)
    }
    if (runtime.capabilities.resume && !runtime.resume) {
      throw new Error(`Runtime "${runtime.id}" declares resume support without implementing resume().`)
    }
    if (runtime.capabilities.attach && !runtime.attach) {
      throw new Error(`Runtime "${runtime.id}" declares attach support without implementing attach().`)
    }
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
