import type { AttemptStatus, MissionStatus, TaskStatus } from './model'

const missionTransitions: Record<MissionStatus, readonly MissionStatus[]> = {
  draft: ['planned', 'cancelled'],
  planned: ['running', 'cancelled'],
  running: ['review', 'cancelled'],
  review: ['running', 'delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

const taskTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ['ready', 'blocked', 'cancelled'],
  ready: ['running', 'blocked', 'cancelled'],
  running: ['succeeded', 'failed', 'blocked', 'cancelled'],
  succeeded: [],
  failed: ['ready', 'cancelled'],
  blocked: ['ready', 'cancelled'],
  cancelled: [],
}

const attemptTransitions: Record<AttemptStatus, readonly AttemptStatus[]> = {
  queued: ['starting', 'cancelled'],
  starting: ['running', 'failed', 'interrupted', 'cancelled'],
  running: ['succeeded', 'failed', 'interrupted', 'cancelled', 'paused'],
  paused: ['running', 'interrupted', 'cancelled'],
  succeeded: [],
  failed: [],
  interrupted: [],
  cancelled: [],
}

function assertTransition<T extends string>(from: T, to: T, transitions: Record<T, readonly T[]>, label: string): void {
  if (!transitions[from].includes(to)) {
    throw new Error(`Invalid ${label} transition: ${from} -> ${to}`)
  }
}

export function canTransitionMission(from: MissionStatus, to: MissionStatus): boolean {
  return missionTransitions[from].includes(to)
}

export function transitionMission(from: MissionStatus, to: MissionStatus): MissionStatus {
  assertTransition(from, to, missionTransitions, 'mission')
  return to
}

export function transitionTask(from: TaskStatus, to: TaskStatus): TaskStatus {
  assertTransition(from, to, taskTransitions, 'task')
  return to
}

export function transitionAttempt(from: AttemptStatus, to: AttemptStatus): AttemptStatus {
  assertTransition(from, to, attemptTransitions, 'attempt')
  return to
}
