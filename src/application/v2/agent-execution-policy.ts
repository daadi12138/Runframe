import type { ExecutorConfig } from '../../executor-config'

export interface AgentExecutionPolicyNode {
  kind: string
  executorId?: string
}

/** Keeps executor readiness, runtime registration, and environment allowlisting out of Run orchestration. */
export class AgentExecutionPolicy {
  constructor(
    private readonly resolveExecutor: (id: string) => Promise<ExecutorConfig | undefined>,
    private readonly hasRunner: (id: string) => boolean,
    private readonly hasRuntime: (id: string) => boolean,
  ) {}

  async validate(nodes: readonly AgentExecutionPolicyNode[]): Promise<void> {
    const requestedIds = [...new Set(nodes.filter(node => node.kind === 'Agent').map(node => node.executorId ?? 'codex'))]
    for (const id of requestedIds) {
      const executor = await this.resolveExecutor(id)
      if (!executor || executor.status !== 'available') throw new Error(`Executor is unavailable: ${id}`)
      if (executor.authentication !== 'authenticated' && executor.authentication !== 'api_key') {
        throw new Error(`Executor requires login before starting a run: ${executor.name}`)
      }
      if (!this.hasRunner(executor.id) || !this.hasRuntime(executor.id)) {
        throw new Error(`Executor runtime adapter not implemented: ${executor.id}`)
      }
    }
  }

  createEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    const coreKeys = [
      'PATH', 'HOME', 'TMPDIR', 'SHELL', 'USER', 'LOGNAME', 'TERM', 'COLORTERM',
      'LANG', 'LC_ALL', 'LC_CTYPE', 'NO_COLOR', 'FORCE_COLOR',
      'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME',
      'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
      'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CODEX_CA_CERTIFICATE',
    ]
    const allowed = new Set(coreKeys)
    for (const key of Object.keys(source)) if (key.startsWith('LC_')) allowed.add(key)
    return Object.fromEntries([...allowed].flatMap(key => source[key] === undefined ? [] : [[key, source[key]]])) as NodeJS.ProcessEnv
  }
}
