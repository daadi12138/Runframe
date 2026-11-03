import path from 'node:path'

export type DiffReviewInput = {
  patch: string
  paths: string[]
  maxPatchBytes?: number
  maxPaths?: number
}

export type ValidatedDiffReview = { patch: string; paths: string[]; truncated: boolean }

const DEFAULT_MAX_PATCH_BYTES = 128 * 1024
const DEFAULT_MAX_PATHS = 500

/** Validate untrusted diff metadata before it is rendered in a review surface. */
export function validateDiffReview(input: DiffReviewInput): ValidatedDiffReview {
  if (typeof input.patch !== 'string' || !Array.isArray(input.paths)) {
    throw new Error('Diff review payload is invalid')
  }
  const maxPatchBytes = input.maxPatchBytes ?? DEFAULT_MAX_PATCH_BYTES
  const maxPaths = input.maxPaths ?? DEFAULT_MAX_PATHS
  if (!Number.isSafeInteger(maxPatchBytes) || maxPatchBytes < 1 || maxPatchBytes > 2 * 1024 * 1024) {
    throw new Error('Diff review patch limit is invalid')
  }
  if (!Number.isSafeInteger(maxPaths) || maxPaths < 1 || maxPaths > 5000) {
    throw new Error('Diff review path limit is invalid')
  }
  const paths = input.paths.slice(0, maxPaths).map(validateRelativePath)
  const bytes = Buffer.byteLength(input.patch, 'utf8')
  if (bytes <= maxPatchBytes) return { patch: input.patch, paths, truncated: input.paths.length > maxPaths }
  const marker = '\\n\\n[Diff preview truncated]'
  const markerBytes = Buffer.byteLength(marker, 'utf8')
  const budget = Math.max(0, maxPatchBytes - markerBytes)
  let patch = input.patch
  while (patch.length > 0 && Buffer.byteLength(patch, 'utf8') > budget) {
    patch = patch.slice(0, Math.max(0, patch.length - Math.max(1, Math.ceil((Buffer.byteLength(patch, 'utf8') - budget) / 2))))
  }
  const preview = (patch + marker).slice(0, maxPatchBytes)
  return { patch: preview, paths, truncated: true }
}

export function validateRelativePath(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || value.includes('\\0')) {
    throw new Error('Diff path is invalid')
  }
  const normalized = value.replace(/\\\\/g, '/')
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.startsWith('//')) {
    throw new Error('Diff path must be workspace-relative')
  }
  const segments = normalized.split('/')
  if (segments.some(segment => segment === '..' || segment === '.')) {
    throw new Error('Diff path contains traversal segments')
  }
  const clean = path.posix.normalize(normalized)
  if (clean === '.' || clean.startsWith('../') || clean === '..') {
    throw new Error('Diff path must be workspace-relative')
  }
  return clean
}
