import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { FilesystemApprovalRepository } from './filesystem-approval-repository'

test('stores approval decisions as immutable, workspace-scoped records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runframe-approvals-'))
  try {
    const repository = new FilesystemApprovalRepository(root)
    const approval = {
      id: 'approval-1',
      scope: { action: 'shell.execute', workspaceRoot: '/workspace/a', command: 'npm test', inputDigest: 'sha256:1' },
      decision: 'granted' as const,
      decidedAt: new Date().toISOString(),
      decidedBy: 'user' as const,
    }
    await repository.create(approval)
    assert.deepEqual(await repository.get(approval.id), approval)
    assert.deepEqual(await repository.list('/workspace/a'), [approval])
    assert.deepEqual(await repository.list('/workspace/b'), [])
    await assert.rejects(() => repository.create({ ...approval, decision: 'denied' }), /EEXIST/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
