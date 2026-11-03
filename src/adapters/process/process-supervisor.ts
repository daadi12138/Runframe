import type { ChildProcess } from 'node:child_process'

/** Owns live child handles independently from Mission/Run orchestration. */
export const activeProcesses = new Map<string, ChildProcess>()

export function isProcessAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid < 1) return false
  try { process.kill(pid, 0); return true } catch { return false }
}

export function terminateProcess(child: ChildProcess | undefined, signal: NodeJS.Signals): void {
  if (!child?.pid) return
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, signal)
    else child.kill(signal)
  } catch {
    try { child.kill(signal) } catch { /* The process may already have exited. */ }
  }
}

export function terminateRecordedProcess(pid: number | undefined): boolean {
  if (!pid || !Number.isSafeInteger(pid) || pid < 1 || pid === process.pid) return false
  try {
    if (process.platform !== 'win32') process.kill(-pid, 'SIGTERM')
    else process.kill(pid, 'SIGTERM')
    if (isProcessAlive(pid)) {
      if (process.platform !== 'win32') process.kill(-pid, 'SIGKILL')
      else process.kill(pid, 'SIGKILL')
    }
    return true
  } catch {
    try { process.kill(pid, 'SIGKILL'); return true } catch { return false }
  }
}
