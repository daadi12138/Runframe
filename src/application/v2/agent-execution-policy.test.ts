import assert from 'node:assert/strict'
import test from 'node:test'
import type { ExecutorConfig } from '../../executor-config'
import { AgentExecutionPolicy } from './agent-execution-policy'

const executor = (overrides: Partial<ExecutorConfig> = {}): ExecutorConfig => ({
  id: 'codex', name: 'Codex', type: 'cli', version: '1', status: 'available', icon: '', tone: '',
  path: '/usr/bin/codex', model: 'default', profile: 'default', capabilities: [],
  authentication: 'authenticated', ...overrides,
})

test('validates only assigned Agent executors and requires a registered runtime', async () => {
  const policy = new AgentExecutionPolicy(async id => executor({ id }), () => true, id => id === 'codex')
  await policy.validate([{ kind: 'Agent' }, { kind: 'Human' }, { kind: 'Agent', executorId: 'codex' }])
  await assert.rejects(policy.validate([{ kind: 'Agent', executorId: 'missing' }]), /runtime adapter not implemented/)
})

test('rejects executors without a registered one-shot runner even if a runtime is present', async () => {
  const policy = new AgentExecutionPolicy(async () => executor(), () => false, () => true)
  await assert.rejects(policy.validate([{ kind: 'Agent' }]), /runtime adapter not implemented/)
})

test('rejects unavailable and unauthenticated executors before dispatch', async () => {
  const unavailable = new AgentExecutionPolicy(async () => executor({ status: 'unconfigured' }), () => true, () => true)
  await assert.rejects(unavailable.validate([{ kind: 'Agent' }]), /unavailable/)
  const unauthenticated = new AgentExecutionPolicy(async () => executor({ authentication: 'needs_login' }), () => true, () => true)
  await assert.rejects(unauthenticated.validate([{ kind: 'Agent' }]), /requires login/)
})

test('builds a minimal executor environment and retains locale overrides only', () => {
  const policy = new AgentExecutionPolicy(async () => executor(), () => true, () => true)
  const environment = policy.createEnvironment({
    PATH: '/bin', HOME: '/home/test', LANG: 'en_US.UTF-8', LC_TIME: 'UTC',
    SECRET_TOKEN: 'must-not-leak', OPENAI_API_KEY: 'must-not-leak',
  })
  assert.equal(environment.PATH, '/bin')
  assert.equal(environment.LC_TIME, 'UTC')
  assert.equal(environment.SECRET_TOKEN, undefined)
  assert.equal(environment.OPENAI_API_KEY, undefined)
})

test('rejects an executor when its legacy CLI runner is not registered', async () => {
  const policy = new AgentExecutionPolicy(async () => executor(), () => false, () => true)
  await assert.rejects(policy.validate([{ kind: 'Agent' }]), /runtime adapter not implemented/)
})
