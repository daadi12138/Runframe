'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type MissionStatus = 'draft' | 'planned' | 'running' | 'review' | 'delivered' | 'cancelled'
type MissionRecord = { id: string; title: string; description: string; status: MissionStatus; createdAt: string; updatedAt: string; activeRunId?: string; acceptanceCriteria?: Array<{ id: string; description: string; required: boolean }> }
type TaskRecord = { id: string; title: string; description?: string; acceptanceCriteria?: string[]; status: 'pending' | 'ready' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'cancelled'; dependsOn: string[] }
type PlanRecord = { id: string; missionId: string; revision: number; nodes: TaskRecord[]; createdAt: string }
type MissionReviewEvidence = {
  plan: PlanRecord
  run: {
    id: string
    status: string
    mission: { planRevision: number }
    nodes: Array<{
      id: string
      kind: string
      state: string
      attempts: Array<{
        id: string
        sessionId?: string
        attempt: number
        executorId: string
        status: string
        startedAt: string
        endedAt?: string
        process?: { pid: number; exitCode?: number | null; signal?: string | null }
        inputArtifactIds: string[]
        traceOmittedCount: number
      }>
    }>
  }
  evidence: {
    processTree: Array<{ id: string; parentId?: string; kind: string; processId?: number; sessionId?: string; startedAt: string; endedAt?: string; exitCode?: number; exitSignal?: string }>
    artifacts: Array<{ id: string; type: string; contentHash: string; attemptId?: string }>
    deliveryDiff: Array<{ path: string; operation: string; classification: string; conflicts: Array<{ path: string; reason: string }> }>
    deliveryReceipt: { status: 'approved' | 'no_changes' } | null
    workspaceApprovalDecisions: Array<{ id: string; decision: 'granted' | 'denied'; scope: { action: string }; decidedAt: string }>
  }
}

const inputStyle = { padding: '9px 11px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 7, color: 'var(--ink)', fontSize: 12, minWidth: 0 } as const
const buttonStyle = { padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--surface)', color: 'var(--ink)', fontSize: 12, cursor: 'pointer' } as const

function processTreeDepth(nodes: MissionReviewEvidence['evidence']['processTree'], node: MissionReviewEvidence['evidence']['processTree'][number]): number {
  const byId = new Map(nodes.map(item => [item.id, item]))
  let depth = 0
  let parentId = node.parentId
  const seen = new Set<string>([node.id])
  while (parentId && depth < nodes.length) {
    if (seen.has(parentId)) break
    seen.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    depth += 1
    parentId = parent.parentId
  }
  return depth
}

export function MissionPlanPanel({ onRunStarted, onDeliveryRequested }: { onRunStarted?: (runId: string) => void; onDeliveryRequested?: (runId: string) => void }) {
  const [missions, setMissions] = useState<MissionRecord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [plan, setPlan] = useState<PlanRecord | null>(null)
  const [missionTitle, setMissionTitle] = useState('')
  const [missionDescription, setMissionDescription] = useState('')
  const [acceptanceCriteriaText, setAcceptanceCriteriaText] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskCriteriaText, setTaskCriteriaText] = useState('')
  const [dependencies, setDependencies] = useState<string[]>([])
  const [draftNodes, setDraftNodes] = useState<TaskRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [executorId, setExecutorId] = useState<'codex' | 'claude'>('codex')
  const [executionMode, setExecutionMode] = useState<'read_only' | 'workspace_write'>('read_only')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [linkedRunStatus, setLinkedRunStatus] = useState<string | null>(null)
  const [deliveryApproved, setDeliveryApproved] = useState(false)
  const [reviewEvidence, setReviewEvidence] = useState<MissionReviewEvidence | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshMissions = useCallback(async () => {
    const response = await fetch('/api/missions')
    if (!response.ok) throw new Error('无法读取 V2 Missions')
    const records = await response.json() as MissionRecord[]
    setMissions(records)
    setSelectedId(current => current && records.some(item => item.id === current) ? current : records[0]?.id ?? '')
  }, [])

  useEffect(() => {
    void refreshMissions().catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
    const timer = window.setInterval(() => { void refreshMissions().catch(() => undefined) }, 3000)
    return () => window.clearInterval(timer)
  }, [refreshMissions])

  useEffect(() => {
    if (!selectedId) { setPlan(null); setDraftNodes([]); return }
    let cancelled = false
    void fetch(`/api/missions/${encodeURIComponent(selectedId)}/plans`)
      .then(async response => response.status === 404 ? null : response.ok ? response.json() as Promise<PlanRecord> : Promise.reject(new Error('无法读取 Plan Revision')))
      .then(value => {
        if (cancelled) return
        setPlan(value)
        setDraftNodes(value?.nodes ?? [])
      })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { cancelled = true }
  }, [selectedId])

  const selectedMission = useMemo(() => missions.find(item => item.id === selectedId) ?? null, [missions, selectedId])

  useEffect(() => {
    if (!selectedMission?.activeRunId) { setLinkedRunStatus(null); setDeliveryApproved(false); return }
    setLinkedRunStatus(null)
    setDeliveryApproved(false)
    let cancelled = false
    const loadStatus = async () => {
      try {
        const response = await fetch(`/api/runs/${encodeURIComponent(selectedMission.activeRunId!)}`)
        const run = response.ok ? await response.json() as { status: string; deliveryApproval?: unknown; deliveryReceipt?: { status: 'approved' | 'no_changes' } } : null
        if (!cancelled) {
          setLinkedRunStatus(run?.status ?? null)
          setDeliveryApproved(Boolean(run && run.status === 'succeeded' && !run.deliveryApproval && run.deliveryReceipt && ['approved', 'no_changes'].includes(run.deliveryReceipt.status)))
        }
      } catch {
        if (!cancelled) setLinkedRunStatus(null)
      }
    }
    void loadStatus()
    const timer = window.setInterval(loadStatus, 2500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [selectedMission?.activeRunId])

  useEffect(() => {
    if (!selectedMission?.activeRunId || selectedMission.status !== 'review') { setReviewEvidence(null); return }
    let cancelled = false
    const loadReview = async () => {
      try {
        const response = await fetch(`/api/missions/${encodeURIComponent(selectedMission.id)}/review`)
        if (!response.ok) return
        const data = await response.json() as MissionReviewEvidence
        if (!cancelled) setReviewEvidence(data)
      } catch { /* Review evidence remains retryable while the Run is active. */ }
    }
    void loadReview()
    const timer = window.setInterval(loadReview, 3000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [selectedMission?.id, selectedMission?.activeRunId, selectedMission?.status])

  const cancelMission = async () => {
    if (!selectedId || !window.confirm('取消此 Mission？如关联 Run 仍在执行或等待审批，也会一并取消。')) return
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/missions/${encodeURIComponent(selectedId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '取消 Mission 失败')
      await refreshMissions()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const requestDeliveryReview = async () => {
    if (!selectedId) return
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/missions/${encodeURIComponent(selectedId)}/delivery`, { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '申请交付审批失败')
      setLinkedRunStatus(result.run.status)
      onDeliveryRequested?.(result.run.id)
      await refreshMissions()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const markDelivered = async () => {
    if (!selectedId) return
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/missions/${encodeURIComponent(selectedId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'delivered' }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '确认交付失败')
      await refreshMissions()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const createMission = async () => {
    if (!missionTitle.trim()) return
    setBusy(true); setError(null)
    try {
      const response = await fetch('/api/missions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: missionTitle,
          description: missionDescription,
          acceptanceCriteria: acceptanceCriteriaText.split(/\r?\n/).map(value => value.trim()).filter(Boolean)
            .map((description, index) => ({ id: `criterion-${index + 1}`, description, required: true })),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '创建 Mission 失败')
      setMissionTitle(''); setMissionDescription(''); setAcceptanceCriteriaText('')
      await refreshMissions()
      setSelectedId(result.id)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const addTask = () => {
    const title = taskTitle.trim()
    if (!title) return
    const id = `task-${draftNodes.length + 1}-${Date.now().toString(36)}`
    setDraftNodes(nodes => [...nodes, {
      id,
      title,
      ...(taskDescription.trim() ? { description: taskDescription.trim() } : {}),
      ...(taskCriteriaText.split(/\r?\n/).map(value => value.trim()).filter(Boolean).length
        ? { acceptanceCriteria: taskCriteriaText.split(/\r?\n/).map(value => value.trim()).filter(Boolean) }
        : {}),
      status: 'pending',
      dependsOn: dependencies,
    }])
    setTaskTitle(''); setTaskDescription(''); setTaskCriteriaText(''); setDependencies([])
  }

  const savePlan = async () => {
    if (!selectedId || !draftNodes.length) return
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/missions/${encodeURIComponent(selectedId)}/plans`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: draftNodes }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '保存 Plan 失败')
      setPlan(result)
      await refreshMissions()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const startExecution = async () => {
    if (!selectedId || !plan || !(selectedMission?.status === 'planned' || selectedMission?.status === 'review')) return
    if (selectedMission.activeRunId && (!linkedRunStatus || !['succeeded', 'failed', 'cancelled'].includes(linkedRunStatus))) {
      setError('上一次 Run 仍在执行或等待审批，请先完成或取消它。')
      return
    }
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/missions/${encodeURIComponent(selectedId)}/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executorId, executionMode }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '启动 Mission Run 失败')
      setActiveRunId(result.run.id)
      onRunStarted?.(result.run.id)
      await refreshMissions()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  return (
    <section style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 24, color: 'var(--ink)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
        <div>
          <span className="section-kicker">V2 MISSION & PLAN GRAPH</span>
          <h2 style={{ margin: '6px 0', fontSize: 20 }}>Mission 规划空间</h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12 }}>独立于旧版 Superagent Mission 的 V2 领域模型。Plan Revision 是不可变快照，依赖图在保存前校验。</p>
        </div>
        <span className="status-pill pending">V2 Planning</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 0.8fr) minmax(360px, 1.5fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)' }}>
          <strong style={{ fontSize: 13 }}>创建 Mission</strong>
          <input style={inputStyle} placeholder="Mission 标题" value={missionTitle} onChange={event => setMissionTitle(event.target.value)} />
          <textarea style={{ ...inputStyle, minHeight: 86, resize: 'vertical' }} placeholder="目标与范围说明" value={missionDescription} onChange={event => setMissionDescription(event.target.value)} />
          <textarea style={{ ...inputStyle, minHeight: 76, resize: 'vertical' }} placeholder="验收标准（每行一条，可选）" value={acceptanceCriteriaText} onChange={event => setAcceptanceCriteriaText(event.target.value)} />
          <button style={buttonStyle} disabled={busy || !missionTitle.trim()} onClick={() => void createMission()}>创建 Mission</button>
          <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
          <label style={{ fontSize: 11, color: 'var(--muted)' }}>已保存的 Missions</label>
          <select style={inputStyle} value={selectedId} onChange={event => setSelectedId(event.target.value)}>
            <option value="">选择 Mission</option>
            {missions.map(item => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}
          </select>
          {selectedMission && (
            <div style={{ padding: 10, background: 'var(--card)', borderRadius: 7, fontSize: 11, color: 'var(--muted)' }}>
              <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{selectedMission.title}</div>
              <div style={{ marginTop: 5 }}>状态：{selectedMission.status}</div>
              <div style={{ marginTop: 4 }}>验收标准：{selectedMission.acceptanceCriteria?.length ?? 0} 项</div>
              <div style={{ marginTop: 4, overflowWrap: 'anywhere' }}>ID：{selectedMission.id}</div>
              {selectedMission.activeRunId && <div style={{ marginTop: 4, overflowWrap: 'anywhere' }}>Run：{selectedMission.activeRunId}</div>}
              {selectedMission.status !== 'delivered' && selectedMission.status !== 'cancelled' && (
                <button style={{ ...buttonStyle, width: '100%', marginTop: 8, color: 'var(--rose)' }} disabled={busy} onClick={() => void cancelMission()}>取消 Mission</button>
              )}
              {selectedMission.status === 'review' && linkedRunStatus === 'succeeded' && !deliveryApproved && (
                <button style={{ ...buttonStyle, width: '100%', marginTop: 8 }} disabled={busy} onClick={() => void requestDeliveryReview()}>申请交付审批</button>
              )}
              {selectedMission.status === 'review' && linkedRunStatus === 'awaiting_delivery' && (
                <div style={{ marginTop: 8, color: 'var(--muted)' }}>交付变更已生成，请在执行时间线中检查 Diff 并批准或拒绝。</div>
              )}
              {selectedMission.status === 'review' && deliveryApproved && (
                <button style={{ ...buttonStyle, width: '100%', marginTop: 8 }} disabled={busy} onClick={() => void markDelivered()}>确认 Mission 已交付</button>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <strong style={{ fontSize: 13 }}>Plan Graph</strong>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{plan ? `已保存 Revision ${plan.revision}` : '尚无已保存版本'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(120px, 0.6fr) auto', gap: 8 }}>
            <input style={inputStyle} placeholder="新增任务节点" value={taskTitle} onChange={event => setTaskTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') addTask() }} />
            <select
              multiple
              style={{ ...inputStyle, minHeight: 38, maxHeight: 84 }}
              value={dependencies}
              onChange={event => setDependencies(Array.from(event.target.selectedOptions, option => option.value))}
              aria-label="选择多个前置依赖（按住 Ctrl 或 Command 多选）"
            >
              {draftNodes.map(node => <option key={node.id} value={node.id}>依赖：{node.title}</option>)}
            </select>
            <button style={buttonStyle} onClick={addTask} disabled={!taskTitle.trim()}>添加</button>
          </div>
          <textarea style={{ ...inputStyle, minHeight: 54, resize: 'vertical' }} placeholder="任务说明（可选）" value={taskDescription} onChange={event => setTaskDescription(event.target.value)} />
          <textarea style={{ ...inputStyle, minHeight: 54, resize: 'vertical' }} placeholder="任务验收标准（每行一条，可选）" value={taskCriteriaText} onChange={event => setTaskCriteriaText(event.target.value)} />
          {draftNodes.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {draftNodes.map((node, index) => (
                <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid var(--line)', borderRadius: 7, background: 'var(--card)' }}>
                  <span style={{ color: 'var(--quiet)', fontSize: 11, fontFamily: 'var(--mono)' }}>{String(index + 1).padStart(2, '0')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{node.title}</div>
                    {node.description && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>{node.description}</div>}
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>依赖：{node.dependsOn.length ? node.dependsOn.map(id => draftNodes.find(item => item.id === id)?.title ?? id).join(', ') : '无'} · 验收：{node.acceptanceCriteria?.length ?? 0} 项</div>
                  </div>
                  <span className="status-pill pending">{node.status}</span>
                  <button style={{ ...buttonStyle, padding: '4px 8px' }} onClick={() => setDraftNodes(nodes => nodes.filter(item => item.id !== node.id).map(item => ({ ...item, dependsOn: item.dependsOn.filter(id => id !== node.id) })))}>移除</button>
                </div>
              ))}
            </div>
          ) : <div style={{ padding: 28, textAlign: 'center', color: 'var(--quiet)', fontSize: 12 }}>添加任务节点，使用依赖选择器构建 DAG。</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>保存会创建新 Revision，不覆盖历史计划。</span>
            <button style={buttonStyle} disabled={busy || !selectedId || !draftNodes.length} onClick={() => void savePlan()}>保存新 Revision</button>
          </div>
          <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select style={inputStyle} value={executorId} onChange={event => setExecutorId(event.target.value as 'codex' | 'claude')}>
              <option value="codex">Codex CLI</option>
              <option value="claude">Claude Code CLI</option>
            </select>
            <select style={inputStyle} value={executionMode} onChange={event => setExecutionMode(event.target.value as 'read_only' | 'workspace_write')}>
              <option value="read_only">只读执行</option>
              <option value="workspace_write">允许 Worktree 写入</option>
            </select>
            <button style={buttonStyle} disabled={busy || !selectedId || !plan || !(selectedMission?.status === 'planned' || selectedMission?.status === 'review') || Boolean(selectedMission?.activeRunId && (!linkedRunStatus || !['succeeded', 'failed', 'cancelled'].includes(linkedRunStatus)))} onClick={() => void startExecution()}>{selectedMission?.status === 'review' ? '重新执行 Plan' : '启动此 Plan'}</button>
          </div>
          {activeRunId && <div style={{ fontSize: 11, color: 'var(--muted)' }}>最近启动的 Run：<code>{activeRunId}</code></div>}
        </div>
      </div>
      {selectedMission?.status === 'review' && reviewEvidence && (
        <section style={{ marginTop: 16, padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: 13 }}>Mission Review Evidence</strong>
              <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>Run {reviewEvidence.run.id} · Plan Revision {reviewEvidence.plan.revision} · {reviewEvidence.run.status}</div>
            </div>
            <span className="status-pill pending">{reviewEvidence.evidence.deliveryReceipt?.status ?? '待交付审批'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginTop: 12 }}>
            {[
              ['Session / Process', reviewEvidence.evidence.processTree.length],
              ['Artifacts', reviewEvidence.evidence.artifacts.length],
              ['Diff entries', reviewEvidence.evidence.deliveryDiff.length],
              ['Workspace decisions', reviewEvidence.evidence.workspaceApprovalDecisions.length],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: 10, borderRadius: 7, background: 'var(--card)' }}>
                <div style={{ color: 'var(--muted)', fontSize: 10 }}>{label}</div>
                <strong style={{ fontSize: 18 }}>{value}</strong>
              </div>
            ))}
          </div>
          {reviewEvidence.run.nodes.some(node => node.attempts.length > 0) && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Task Attempt Provenance</div>
              {reviewEvidence.run.nodes.flatMap(node => node.attempts.map(attempt => ({ node, attempt }))).map(({ node, attempt }) => (
                <div key={attempt.id} style={{ padding: '7px 0', borderTop: '1px solid var(--line)', fontSize: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{node.id} · Attempt {attempt.attempt}</strong>
                    <span>{attempt.status}</span>
                  </div>
                  <div style={{ color: 'var(--muted)', marginTop: 3 }}>
                    {attempt.executorId} · {attempt.id}{attempt.sessionId ? ` · Session ${attempt.sessionId}` : ''} · {new Date(attempt.startedAt).toLocaleTimeString()}
                    {attempt.endedAt ? ` → ${new Date(attempt.endedAt).toLocaleTimeString()}` : ''}
                    {attempt.process?.pid ? ` · PID ${attempt.process.pid}` : ''}
                    {attempt.process?.exitCode === null ? ` · ${attempt.process.signal ?? 'exit status unknown'}` : attempt.process?.exitCode === undefined ? '' : ` · exit ${attempt.process.exitCode}`}
                  </div>
                  {attempt.traceOmittedCount > 0 && <div style={{ color: 'var(--muted)', marginTop: 2 }}>{attempt.traceOmittedCount} earlier trace entries omitted from the bounded manifest view.</div>}
                  {attempt.inputArtifactIds.length > 0 && <div style={{ color: 'var(--muted)', marginTop: 2 }}>Input artifacts: {attempt.inputArtifactIds.join(', ')}</div>}
                </div>
              ))}
            </div>
          )}
          {reviewEvidence.evidence.processTree.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Observed Session / OS Process Tree</div>
              {reviewEvidence.evidence.processTree.map(node => (
                <div key={node.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 0', paddingLeft: Math.min(processTreeDepth(reviewEvidence.evidence.processTree, node), 5) * 14, borderTop: '1px solid var(--line)', fontSize: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div><strong>{node.kind.replace('_', ' ')}</strong> · {node.sessionId ?? node.id}</div>
                    <div style={{ color: 'var(--muted)' }}>{new Date(node.startedAt).toLocaleTimeString()}{node.endedAt ? ` → ${new Date(node.endedAt).toLocaleTimeString()}` : ' · active at last observation'}</div>
                  </div>
                  <span style={{ flexShrink: 0, color: node.endedAt && node.exitCode !== undefined && node.exitCode !== 0 ? 'var(--rose)' : 'var(--muted)' }}>
                    {node.processId ? `PID ${node.processId}` : ''}{node.exitCode === undefined ? node.exitSignal ? ` · ${node.exitSignal}` : '' : ` · exit ${node.exitCode}`}
                  </span>
                </div>
              ))}
            </div>
          )}
          {reviewEvidence.evidence.artifacts.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Artifact provenance</div>
              {reviewEvidence.evidence.artifacts.map(artifact => (
                <div key={artifact.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: 10 }}>
                  <span>{artifact.type} · {artifact.id}{artifact.attemptId ? ` · Attempt ${artifact.attemptId}` : ''}</span>
                  <code>{artifact.contentHash.slice(0, 12)}</code>
                </div>
              ))}
            </div>
          )}
          {reviewEvidence.evidence.deliveryDiff.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Delivery Diff Evidence</div>
              {reviewEvidence.evidence.deliveryDiff.map((change, index) => (
                <div key={`${change.path}-${index}`} style={{ padding: '8px 0', borderTop: '1px solid var(--line)', fontSize: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <code style={{ overflowWrap: 'anywhere' }}>{change.path}</code>
                    <span>{change.operation} · {change.classification}</span>
                  </div>
                  {change.conflicts.map((conflict, conflictIndex) => (
                    <div key={conflictIndex} role="alert" style={{ marginTop: 5, color: 'var(--rose)' }}>
                      冲突：{conflict.path} · {conflict.reason}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {reviewEvidence.evidence.workspaceApprovalDecisions.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Workspace Approval Audit</div>
              {reviewEvidence.evidence.workspaceApprovalDecisions.map(approval => (
                <div key={approval.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: 10 }}>
                  <span>{approval.scope.action} · {approval.id}</span>
                  <span style={{ color: approval.decision === 'granted' ? 'var(--green, var(--muted))' : 'var(--rose)' }}>{approval.decision}</span>
                </div>
              ))}
            </div>
          )}
          {reviewEvidence.evidence.deliveryDiff.some(change => change.conflicts.length > 0) && (
            <div role="alert" style={{ marginTop: 10, color: 'var(--rose)', fontSize: 11 }}>
              检测到 {reviewEvidence.evidence.deliveryDiff.reduce((count, change) => count + change.conflicts.length, 0)} 个交付冲突；完成冲突处理前不要确认交付。
            </div>
          )}
        </section>
      )}
      {error && <div role="alert" style={{ marginTop: 12, color: 'var(--rose)', fontSize: 12 }}>{error}</div>}
      {!selectedId && <div style={{ marginTop: 14, color: 'var(--muted)', fontSize: 12 }}>先创建或选择一个 Mission，再为它建立 Plan Graph。</div>}
    </section>
  )
}
