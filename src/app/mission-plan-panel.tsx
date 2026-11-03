'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type MissionStatus = 'draft' | 'planned' | 'running' | 'review' | 'delivered' | 'cancelled'
type MissionRecord = { id: string; title: string; description: string; status: MissionStatus; createdAt: string; updatedAt: string }
type TaskRecord = { id: string; title: string; description?: string; status: 'pending' | 'ready' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'cancelled'; dependsOn: string[] }
type PlanRecord = { id: string; missionId: string; revision: number; nodes: TaskRecord[]; createdAt: string }

const inputStyle = { padding: '9px 11px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 7, color: 'var(--ink)', fontSize: 12, minWidth: 0 } as const
const buttonStyle = { padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--surface)', color: 'var(--ink)', fontSize: 12, cursor: 'pointer' } as const

export function MissionPlanPanel() {
  const [missions, setMissions] = useState<MissionRecord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [plan, setPlan] = useState<PlanRecord | null>(null)
  const [missionTitle, setMissionTitle] = useState('')
  const [missionDescription, setMissionDescription] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [dependency, setDependency] = useState('')
  const [draftNodes, setDraftNodes] = useState<TaskRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshMissions = useCallback(async () => {
    const response = await fetch('/api/missions')
    if (!response.ok) throw new Error('无法读取 V2 Missions')
    const records = await response.json() as MissionRecord[]
    setMissions(records)
    setSelectedId(current => current && records.some(item => item.id === current) ? current : records[0]?.id ?? '')
  }, [])

  useEffect(() => { void refreshMissions().catch(reason => setError(reason instanceof Error ? reason.message : String(reason))) }, [refreshMissions])

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

  const createMission = async () => {
    if (!missionTitle.trim()) return
    setBusy(true); setError(null)
    try {
      const response = await fetch('/api/missions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: missionTitle, description: missionDescription }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '创建 Mission 失败')
      setMissionTitle(''); setMissionDescription('')
      await refreshMissions()
      setSelectedId(result.id)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const addTask = () => {
    const title = taskTitle.trim()
    if (!title) return
    const id = `task-${draftNodes.length + 1}-${Date.now().toString(36)}`
    setDraftNodes(nodes => [...nodes, { id, title, status: 'pending', dependsOn: dependency ? [dependency] : [] }])
    setTaskTitle(''); setDependency('')
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
              <div style={{ marginTop: 4, overflowWrap: 'anywhere' }}>ID：{selectedMission.id}</div>
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
            <select style={inputStyle} value={dependency} onChange={event => setDependency(event.target.value)}>
              <option value="">无依赖</option>
              {draftNodes.map(node => <option key={node.id} value={node.id}>依赖：{node.title}</option>)}
            </select>
            <button style={buttonStyle} onClick={addTask} disabled={!taskTitle.trim()}>添加</button>
          </div>
          {draftNodes.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {draftNodes.map((node, index) => (
                <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid var(--line)', borderRadius: 7, background: 'var(--card)' }}>
                  <span style={{ color: 'var(--quiet)', fontSize: 11, fontFamily: 'var(--mono)' }}>{String(index + 1).padStart(2, '0')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{node.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>依赖：{node.dependsOn.length ? node.dependsOn.map(id => draftNodes.find(item => item.id === id)?.title ?? id).join(', ') : '无'}</div>
                  </div>
                  <span className="status-pill pending">{node.status}</span>
                  <button style={{ ...buttonStyle, padding: '4px 8px' }} onClick={() => setDraftNodes(nodes => nodes.filter(item => item.id !== node.id).map(item => ({ ...item, dependsOn: item.dependsOn.filter(id => id !== node.id) })))}>移除</button>
                </div>
              ))}
            </div>
          ) : <div style={{ padding: 28, textAlign: 'center', color: 'var(--quiet)', fontSize: 12 }}>添加任务节点，使用依赖选择器构建 DAG。</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>保存会创建新 Revision，不覆盖历史计划。</span>
            <button style={buttonStyle} disabled={busy || !selectedId || !draftNodes.length} onClick={() => void savePlan()}>保存新 Revision</button>
          </div>
        </div>
      </div>
      {error && <div role="alert" style={{ marginTop: 12, color: 'var(--rose)', fontSize: 12 }}>{error}</div>}
      {!selectedId && <div style={{ marginTop: 14, color: 'var(--muted)', fontSize: 12 }}>先创建或选择一个 Mission，再为它建立 Plan Graph。</div>}
    </section>
  )
}
