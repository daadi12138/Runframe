import { join } from 'node:path'
import { FilesystemMissionRepository } from './filesystem-mission-repository'

export function createDefaultMissionRepository(): FilesystemMissionRepository {
  const stateRoot = process.env.ARTIFACT_STATE_DIR || join(process.cwd(), '.artifact-state')
  return new FilesystemMissionRepository(join(stateRoot, 'v2'))
}
