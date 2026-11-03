import assert from 'node:assert/strict'
import test from 'node:test'
import type { Mission } from '../../domain/v2/model'
import { reconcileMissionRun } from './mission-reconciliation'

const mission: Mission = {
  id: 'mission-recovery', title: 'Recover', description: '', status: 'planned',
  acceptanceCriteria: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

test('links an orphan active Run and restores the Mission to running', () => {
  const recovered = reconcileMissionRun(mission, { id: 'run-orphan', status: 'running' })
  assert.equal(recovered.activeRunId, 'run-orphan')
  assert.equal(recovered.status, 'running')
})

test('moves completed and delivery-pending runs into Mission review', () => {
  assert.equal(reconcileMissionRun(mission, { id: 'run-done', status: 'succeeded' }).status, 'review')
  assert.equal(reconcileMissionRun(mission, { id: 'run-delivery', status: 'awaiting_delivery' }).status, 'review')
})

test('never reopens delivered or cancelled Missions', () => {
  const delivered = { ...mission, status: 'delivered' as const, activeRunId: 'run-old' }
  assert.equal(reconcileMissionRun(delivered, { id: 'run-new', status: 'running' }), delivered)
  const cancelled = { ...mission, status: 'cancelled' as const }
  assert.equal(reconcileMissionRun(cancelled, { id: 'run-old', status: 'succeeded' }), cancelled)
})
