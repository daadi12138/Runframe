import assert from 'node:assert/strict'
import test from 'node:test'
import { OneShotCliAgentRuntime } from './one-shot-cli-runtime'

test('streams runner events and terminal result through the AgentRuntime port', async () => {
  const runtime = new OneShotCliAgentRuntime('codex', async (request, emit) => {
    await emit({ sessionId: request.attemptId, stream: 'stdout', text: 'working', occurredAt: '2026-01-01T00:00:00.000Z' })
    return { output: 'complete' }
  }, async () => undefined)
  const handle = await runtime.launch({ attemptId: 'attempt-1', workspaceRoot: '/workspace', prompt: 'do work' })
  const events = []
  for await (const event of runtime.output(handle.sessionId)) events.push(event)
  assert.deepEqual(events.map(event => event.text), ['Agent session started.', 'working', 'Agent execution completed.', 'Agent session ended.'])
  assert.equal(events[0]?.event?.type, 'session.started')
  assert.equal(events[2]?.event?.type, 'result')
  assert.equal(events.at(-1)?.event?.type, 'session.ended')
  assert.equal(runtime.capabilities.attach, false)
  assert.equal(runtime.capabilities.cancellation, true)
})

test('delegates cancellation to the active CLI process controller', async () => {
  const cancelled: string[] = []
  const runtime = new OneShotCliAgentRuntime('claude', async () => new Promise(() => undefined), async id => { cancelled.push(id) })
  const handle = await runtime.launch({ attemptId: 'attempt-2', workspaceRoot: '/workspace', prompt: 'do work' })
  await runtime.cancel(handle.sessionId)
  assert.deepEqual(cancelled, ['attempt-2'])
})

test('rejects duplicate sessions for the same Attempt', async () => {
  const runtime = new OneShotCliAgentRuntime('codex', async () => new Promise(() => undefined), async () => undefined)
  await runtime.launch({ attemptId: 'attempt-3', workspaceRoot: '/workspace', prompt: 'do work' })
  await assert.rejects(runtime.launch({ attemptId: 'attempt-3', workspaceRoot: '/workspace', prompt: 'again' }), /already exists/)
})

test('applies bounded lossless backpressure when output consumer is slower than producer', async () => {
  let produced = 0
  const runtime = new OneShotCliAgentRuntime('codex', async (request, emit) => {
    for (let index = 0; index < 300; index += 1) {
      await emit({ sessionId: request.attemptId, stream: 'stdout', text: String(index), occurredAt: '2026-01-01T00:00:00.000Z' })
      produced += 1
    }
    return { output: 'complete' }
  }, async () => undefined)
  const handle = await runtime.launch({ attemptId: 'attempt-backpressure', workspaceRoot: '/workspace', prompt: 'emit' })
  const received: string[] = []
  for await (const event of runtime.output(handle.sessionId)) {
    if (event.stream === 'stdout') {
      received.push(event.text)
      await new Promise(resolve => setImmediate(resolve))
    }
  }
  assert.equal(produced, 300)
  assert.equal(received.length, 300)
  assert.equal(received[0], '0')
  assert.equal(received.at(-1), '299')
})
