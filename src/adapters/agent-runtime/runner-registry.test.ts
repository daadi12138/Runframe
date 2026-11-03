import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentRunnerRegistry } from './runner-registry'
import type { AgentCapabilities } from '../../domain/v2/model'

const capabilities: AgentCapabilities = {
  streamingOutput: true,
  structuredEvents: true,
  cancellation: true,
  pause: false,
  resume: false,
  attach: false,
  usageReporting: false,
}

const runner = (id: string) => ({ id, capabilities, run: async () => 'ok' })

test('registers and retrieves concrete runners', async () => {
  const registry = new AgentRunnerRegistry([runner('codex')])
  assert.equal(registry.has('codex'), true)
  assert.equal(await registry.get('codex')?.run(), 'ok')
  assert.deepEqual(registry.list().map(item => item.id), ['codex'])
})

test('rejects duplicate runner IDs', () => {
  const registry = new AgentRunnerRegistry([runner('codex')])
  assert.throws(() => registry.register(runner('codex')), /already registered/)
})

test('replacement changes the implementation without changing its ID', async () => {
  const registry = new AgentRunnerRegistry([runner('codex')])
  registry.replace({ ...runner('codex'), run: async () => 'replacement' })
  assert.equal(await registry.get('codex')?.run(), 'replacement')
})

test('rejects incomplete capability declarations and missing runner functions', () => {
  const registry = new AgentRunnerRegistry()
  const incomplete = { ...runner('bad'), capabilities: { streamingOutput: true } as unknown as AgentCapabilities }
  assert.throws(() => registry.register(incomplete), /every capability/)
  const missing = { ...runner('missing'), run: undefined } as unknown as Parameters<typeof registry.register>[0]
  assert.throws(() => registry.register(missing), /implement run/)
})

test('reports missing runners without throwing during capability discovery', () => {
  const registry = new AgentRunnerRegistry([runner('claude')])
  assert.equal(registry.has('codex'), false)
  assert.equal(registry.get('codex'), undefined)
})
