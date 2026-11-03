import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
    await assert.rejects(() => repository.create({ ...approval, id: 'approval-invalid', decision: 'unknown' as 'granted' }), /granted or denied/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects corrupted approval records instead of treating them as authorization', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runframe-approval-corrupt-'))
  try {
    const directory = join(root, 'approvals')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'approval-corrupt.json'), JSON.stringify({
      id: 'approval-corrupt',
      scope: { action: 'shell.execute', workspaceRoot: '/workspace/project' },
      decision: 'maybe', decidedAt: new Date().toISOString(), decidedBy: 'user',
    }))
    const repository = new FilesystemApprovalRepository(root)
    await assert.rejects(() => repository.get('approval-corrupt'), /invalid decision/)
    await assert.rejects(() => repository.list('/workspace/project'), /invalid decision/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
