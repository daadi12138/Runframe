import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentRuntime } from '../../ports/v2/agent-runtime'
import { AgentRuntimeRegistry } from './registry'

const runtime = (overrides: Partial<AgentRuntime> = {}): AgentRuntime => ({
  id: 'codex',
  capabilities: { streamingOutput: true, structuredEvents: false, cancellation: true, pause: false, resume: false, attach: false, usageReporting: false },
  async launch() { return { sessionId: 'session-1' } },
  async cancel() {},
  async *output() {},
  ...overrides,
})

test('registers runtimes and rejects duplicate IDs', () => {
  const registry = new AgentRuntimeRegistry()
  registry.register(runtime())
  assert.equal(registry.get('codex').id, 'codex')
  assert.throws(() => registry.register(runtime()), /already registered/)
})

test('rejects capabilities without matching runtime operations', () => {
  const registry = new AgentRuntimeRegistry()
  assert.throws(() => registry.register(runtime({
    capabilities: { streamingOutput: true, structuredEvents: false, cancellation: true, pause: true, resume: false, attach: false, usageReporting: false },
  })), /declares pause support/)
})

test('lists runtimes deterministically and disposes registered adapters', async () => {
  let disposed = false
  const registry = new AgentRuntimeRegistry()
  registry.register(runtime({ id: 'zeta' }))
  registry.register(runtime({ id: 'alpha', async dispose() { disposed = true } }))
  assert.deepEqual(registry.list().map(item => item.id), ['alpha', 'zeta'])
  await registry.dispose()
  assert.equal(disposed, true)
  assert.equal(registry.list().length, 0)
})

test('rejects runtimes that declare cancellation without a cancel operation', () => {
  const registry = new AgentRuntimeRegistry()
  const invalid = runtime({ cancel: undefined }) as unknown as AgentRuntime
  assert.throws(() => registry.register(invalid), /declares cancellation support/)
})

test('disposes the previous adapter when replacing a runtime', async () => {
  let disposed = false
  const registry = new AgentRuntimeRegistry()
  registry.register(runtime({ async dispose() { disposed = true } }))
  await registry.replace(runtime())
  assert.equal(disposed, true)
  assert.equal(registry.get('codex').id, 'codex')
})
