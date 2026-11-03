import assert from 'node:assert/strict'
import test from 'node:test'
import type { Approval } from '../../domain/v2/model'
import type { ApprovalRepository } from '../../ports/v2/approval-repository'
import { ApprovalService } from './approval-service'

class MemoryApprovalRepository implements ApprovalRepository {
  records = new Map<string, Approval>()
  async get(id: string) { return this.records.get(id) ?? null }
  async list(workspaceRoot?: string) {
    return [...this.records.values()].filter(item => workspaceRoot === undefined || item.scope.workspaceRoot === workspaceRoot)
  }
  async create(approval: Approval) {
    if (this.records.has(approval.id)) throw new Error('Approval is immutable.')
    this.records.set(approval.id, approval)
  }
}

test('grants only an exact scope and never broadens an approval', async () => {
  const repository = new MemoryApprovalRepository()
  const service = new ApprovalService(repository, () => new Date('2026-01-01T00:00:00.000Z'), () => 'approval-1')
  const scope = { action: 'shell.execute', workspaceRoot: '/workspace/project', command: 'npm test', inputDigest: 'sha256:abc' }
  await service.decide(scope, 'granted')
  assert.equal(await service.isGranted(scope), true)
  assert.equal(await service.isGranted({ ...scope, command: 'npm install' }), false)
  assert.equal(await service.isGranted({ ...scope, inputDigest: 'sha256:changed' }), false)
})

test('a denied decision does not authorize an action', async () => {
  const repository = new MemoryApprovalRepository()
  const service = new ApprovalService(repository, () => new Date(), () => 'approval-denied')
  const scope = { action: 'git.push', workspaceRoot: '/workspace/project' }
  await service.decide(scope, 'denied')
  assert.equal(await service.isGranted(scope), false)
})
