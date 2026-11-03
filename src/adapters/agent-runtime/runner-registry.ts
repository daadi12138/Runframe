import type { AgentCapabilities } from '../../domain/v2/model'

export interface AgentRunnerRegistration<TRunner> {
  id: string
  capabilities: AgentCapabilities
  run: TRunner
}

/**
 * Registry for the concrete CLI runners used by the legacy Run lifecycle.
 * This is deliberately distinct from AgentRuntimeRegistry: a runner is a
 * one-shot invocation, not a resumable/attachable session.
 */
export class AgentRunnerRegistry<TRunner> {
  private readonly runners = new Map<string, AgentRunnerRegistration<TRunner>>()

  constructor(registrations: readonly AgentRunnerRegistration<TRunner>[] = []) {
    for (const registration of registrations) this.register(registration)
  }

  register(registration: AgentRunnerRegistration<TRunner>): void {
    this.validate(registration)
    if (this.runners.has(registration.id)) throw new Error(`Agent runner already registered: ${registration.id}`)
    this.runners.set(registration.id, registration)
  }

  replace(registration: AgentRunnerRegistration<TRunner>): void {
    this.validate(registration)
    this.runners.set(registration.id, registration)
  }

  get(id: string): AgentRunnerRegistration<TRunner> | undefined {
    return this.runners.get(id)
  }

  has(id: string): boolean {
    return this.runners.has(id)
  }

  list(): AgentRunnerRegistration<TRunner>[] {
    return [...this.runners.values()].sort((a, b) => a.id.localeCompare(b.id))
  }

  private validate(registration: AgentRunnerRegistration<TRunner>): void {
    if (!registration || typeof registration.id !== 'string' || !registration.id.trim()) {
      throw new Error('Agent runner ID must not be empty.')
    }
    const keys: Array<keyof AgentCapabilities> = [
      'streamingOutput', 'structuredEvents', 'cancellation', 'pause', 'resume', 'attach', 'usageReporting',
    ]
    if (!registration.capabilities || keys.some(key => typeof registration.capabilities[key] !== 'boolean')) {
      throw new Error(`Agent runner "${registration.id}" must declare every capability as a boolean.`)
    }
    if (typeof registration.run !== 'function') throw new Error(`Agent runner "${registration.id}" must implement run().`)
  }
}
