import { mkdir, open, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Approval } from '../../domain/v2/model'
import type { ApprovalRepository } from '../../ports/v2/approval-repository'

const safeId = (id: string): string => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new Error('Invalid approval ID.')
  return id
}

export class FilesystemApprovalRepository implements ApprovalRepository {
  constructor(private readonly rootDirectory: string) {}

  private path(id: string): string {
    return join(this.rootDirectory, 'approvals', `${safeId(id)}.json`)
  }

  async get(approvalId: string): Promise<Approval | null> {
    try {
      return JSON.parse(await readFile(this.path(approvalId), 'utf8')) as Approval
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async list(workspaceRoot?: string): Promise<Approval[]> {
    const directory = join(this.rootDirectory, 'approvals')
    let files: string[]
    try { files = await readdir(directory) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const records = await Promise.all(files.filter(file => file.endsWith('.json')).map(async file => {
      try { return JSON.parse(await readFile(join(directory, file), 'utf8')) as Approval } catch { return null }
    }))
    return records.filter((record): record is Approval => record !== null)
      .filter(record => workspaceRoot === undefined || record.scope.workspaceRoot === workspaceRoot)
      .sort((left, right) => left.decidedAt.localeCompare(right.decidedAt))
  }

  async create(approval: Approval): Promise<void> {
    if (!approval.id?.trim() || !approval.scope?.action?.trim() || !approval.scope.workspaceRoot?.trim()) {
      throw new Error('Approval ID, action, and workspace root are required.')
    }
    if (!Number.isFinite(Date.parse(approval.decidedAt))) throw new Error('Approval decision timestamp is invalid.')
    const path = this.path(approval.id)
    await mkdir(join(path, '..'), { recursive: true })
    // Exclusive creation is the immutability boundary: an approval is never updated in place.
    const handle = await open(path, 'wx')
    try {
      await handle.writeFile(`${JSON.stringify(approval, null, 2)}\n`, 'utf8')
      await handle.sync()
    } catch (error) {
      await rm(path, { force: true }).catch(() => undefined)
      throw error
    } finally {
      await handle.close()
    }
  }
}
