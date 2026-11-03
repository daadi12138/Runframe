import assert from 'node:assert/strict'
import test from 'node:test'
import { OneShotCliAgentRuntime } from '../../adapters/agent-runtime/one-shot-cli-runtime'
import { AgentAttemptService } from './agent-attempt-service'

test('executes a Task Attempt through the AgentRuntime port and forwards trace events', async () => {
  const runtime = new OneShotCliAgentRuntime('codex', async request => ({
    output: request.prompt,
  }), async () => undefined)
  const service = new AgentAttemptService(id => {
    assert.equal(id, 'codex')
    return runtime
  })
  const traces: unknown[] = []
  const result = await service.execute<{ kind: string }, { output: string }>('codex', {
    attemptId: 'attempt-service',
    workspaceRoot: '/worktree',
    prompt: 'implement',
  }, async trace => { traces.push(trace) })
  assert.deepEqual(result, { output: 'implement' })
  assert.deepEqual(traces, [])
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
