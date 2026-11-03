import assert from 'node:assert/strict'
import test from 'node:test'
import { OneShotCliAgentRuntime } from '../../adapters/agent-runtime/one-shot-cli-runtime'
import { AgentAttemptService } from './agent-attempt-service'

test('executes a Task Attempt through the AgentRuntime port and forwards trace events', async () => {
  const runtime = new OneShotCliAgentRuntime('codex', async (request, emit) => {
    await emit({ sessionId: request.attemptId, stream: 'stdout', text: 'raw chunk', occurredAt: '2026-01-01T00:00:00.000Z' })
    await emit({ sessionId: request.attemptId, stream: 'system', text: 'status', occurredAt: '2026-01-01T00:00:01.000Z', event: { type: 'trace', payload: { kind: 'status' } } })
    return { output: request.prompt }
  }, async () => undefined)
  const service = new AgentAttemptService(id => {
    assert.equal(id, 'codex')
    return runtime
  })
  const traces: unknown[] = []
  const outputs: string[] = []
  const result = await service.execute<{ kind: string }, { output: string }>('codex', {
    attemptId: 'attempt-service',
    workspaceRoot: '/worktree',
    prompt: 'implement',
  }, async trace => { traces.push(trace) }, async output => { outputs.push(output.text) })
  assert.deepEqual(result, { output: 'implement' })
  assert.deepEqual(traces, [{ kind: 'status' }])
  assert.deepEqual(outputs, ['raw chunk'])
})

test('fails clearly when a runtime does not declare cancellation support', async () => {
  const runtime = {
    id: 'readonly',
    capabilities: { streamingOutput: true, structuredEvents: false, cancellation: false, pause: false, resume: false, attach: false, usageReporting: false },
    async launch() { return { sessionId: 's' } },
    async *output() {},
  }
  const service = new AgentAttemptService(() => runtime)
  await assert.rejects(service.cancel('readonly', 's'), /does not support capability "cancellation"/)
})

test('rejects structured events from runtimes that did not declare the capability', async () => {
  const runtime = new OneShotCliAgentRuntime('bad-runtime', async request => ({ output: request.prompt }), async () => undefined)
  const unsafe = {
    id: runtime.id,
    capabilities: { ...runtime.capabilities, structuredEvents: false },
    launch: (request: Parameters<typeof runtime.launch>[0]) => runtime.launch(request),
    cancel: (sessionId: string) => runtime.cancel(sessionId),
    async *output(sessionId: string) {
      yield { sessionId, stream: 'system' as const, text: 'unexpected', occurredAt: '2026-01-01T00:00:00.000Z', event: { type: 'result', payload: { output: 'no' } } }
    },
  }
  const service = new AgentAttemptService(() => unsafe)
  await assert.rejects(service.execute('bad-runtime', {
    attemptId: 'attempt-unsafe',
    workspaceRoot: '/worktree',
    prompt: 'test',
  }), /without declaring structuredEvents support/)
})

test('cancels a session when durable trace consumption fails', async () => {
  const cancelled: string[] = []
  const runtime = new OneShotCliAgentRuntime('codex', async (request, emit) => {
    await emit({ sessionId: request.attemptId, stream: 'system', text: 'trace', occurredAt: '2026-01-01T00:00:00.000Z', event: { type: 'trace', payload: { kind: 'status' } } })
    return { output: 'never accepted' }
  }, async sessionId => { cancelled.push(sessionId) })
  const service = new AgentAttemptService(() => runtime)
  await assert.rejects(service.execute('codex', {
    attemptId: 'attempt-sink-failure',
    workspaceRoot: '/worktree',
    prompt: 'test',
  }, async () => { throw new Error('journal unavailable') }), /journal unavailable/)
  assert.deepEqual(cancelled, ['attempt-sink-failure'])
})
