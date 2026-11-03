import assert from 'node:assert/strict'
import test from 'node:test'
import { activeProcesses, isProcessAlive, terminateRecordedProcess } from './process-supervisor'

test('tracks active child handles by Attempt identity', () => {
  const child = { pid: 4242 } as unknown as import('node:child_process').ChildProcess
  activeProcesses.set('attempt-process-test', child)
  assert.equal(activeProcesses.get('attempt-process-test')?.pid, 4242)
  activeProcesses.delete('attempt-process-test')
  assert.equal(activeProcesses.has('attempt-process-test'), false)
})

test('checks process liveness defensively and never terminates the current process from a recorded PID', () => {
  assert.equal(isProcessAlive(-1), false)
  assert.equal(isProcessAlive(Number.NaN), false)
  assert.equal(isProcessAlive(process.pid), true)
  assert.equal(terminateRecordedProcess(process.pid), false)
  assert.equal(terminateRecordedProcess(undefined), false)
})
