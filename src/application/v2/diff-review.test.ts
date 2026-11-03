import assert from 'node:assert/strict'
import test from 'node:test'
import { validateDiffReview, validateRelativePath } from './diff-review'

test('normalizes safe relative paths and rejects traversal or absolute paths', () => {
  assert.equal(validateRelativePath('src\\\\feature.ts'), 'src/feature.ts')
  assert.throws(() => validateRelativePath('../secret'), /traversal/)
  assert.throws(() => validateRelativePath('src/../../secret'), /traversal/)
  assert.throws(() => validateRelativePath('/etc/passwd'), /relative/)
  assert.throws(() => validateRelativePath('C:\\\\secret'), /relative/)
})

test('bounds diff preview bytes and path count', () => {
  const result = validateDiffReview({ patch: 'é'.repeat(100), paths: ['a.ts', 'b.ts'], maxPatchBytes: 32, maxPaths: 1 })
  assert.equal(result.paths.length, 1)
  assert.equal(result.truncated, true)
  assert.ok(Buffer.byteLength(result.patch, 'utf8') <= 80)
  assert.match(result.patch, /truncated/)
})

test('rejects invalid bounds and malformed path data', () => {
  assert.throws(() => validateDiffReview({ patch: '', paths: [''] }), /path is invalid/)
  assert.throws(() => validateDiffReview({ patch: '', paths: [], maxPatchBytes: 0 }), /limit is invalid/)
})
