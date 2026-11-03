'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Compass,
  FileCode,
  FileDiff,
  FileText,
  Filter,
  FolderOpen,
  GitBranch,
  History,
  Layers,
  LayoutGrid,
  Loader2,
  Package,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Split,
  Terminal,
  UserCheck,
  Workflow,
  X,
} from 'lucide-react'
import type { AgentRole, ExecutionMode, OrchestratedTicket, SuperagentMission, TicketStage } from '@/agent-orchestrator'
import { TerminalWorkbench, type ArtifactWorkbenchTarget, type WorkbenchMode } from './workbench'
import { MissionPlanPanel } from './mission-plan-panel'

export type RunWorkspaceRun = {
  id: string
  status: string
  startedAt: string
  endedAt?: string
  branchName?: string
  workflow?: { workflowId: string; workflowName: string; revision: number; publishedAt: string }
  mission?: { missionId: string; missionTitle: string; planRevisionId: string; planRevision: number }
  input: { text: string; attachments: Array<{ id: string; name: string; mediaType: string; byteLength: number }> }
  nodes: Array<{ id: string; kind: string; state: string; attempts: unknown[] }>
  edges: Array<{ from: string; to: string }>
  logs: string[]
  events: Array<{ id: string; occurredAt: string; type: string; message: string; details?: Record<string, unknown> }>
  artifacts: Array<{ id: string; nodeId: string; type: string; version: number; schemaId: string; schemaVersion: number; status: string; contentHash: string }>
  deliveryApproval?: { requestedAt: string; changedFiles: string[] }
}

type HubTab = 'kanban' | 'v2-plan' | 'timeline' | 'diff' | 'artifacts' | 'terminal'
type PersistedExecutionEvent = {
  id: string
  sequence: number
  kind: string
  occurredAt: string
  payload: { message?: string; nodeId?: string; details?: Record<string, unknown>; legacyType?: string }
}

const stageColumns: Array<{ id: TicketStage; label: string; icon: typeof Clock; color: string }> = [
  { id: 'backlog', label: '待办排期', icon: Layers, color: '#94a3b8' },
  { id: 'planning', label: '架构与规格', icon: BrainCircuit, color: '#818cf8' },
  { id: 'in_progress', label: '并行执行中', icon: Play, color: '#60a5fa' },
  { id: 'gate', label: '审批与门禁', icon: ShieldAlert, color: '#fbbf24' },
  { id: 'validating', label: '验证与测试', icon: CheckCircle2, color: '#34d399' },
  { id: 'completed', label: '已完成交付', icon: ShieldCheck, color: '#10b981' },
  { id: 'blocked', label: '阻塞与异常', icon: AlertTriangle, color: '#f87171' },
]

const presetGoals = [
  { label: '修复运行时 Bug', goal: '修复页面交互偶发异常并补充单元测试用例', mode: 'autonomous' as const },
  { label: '新功能端到端实现', goal: '实现用户身份多因子认证机制与 Session 守护', mode: 'autonomous' as const },
  { label: 'UI 现代化改造', goal: '重构核心操作台视觉系统并全面支持深色模式响应', mode: 'observe' as const },
  { label: '性能与包体积优化', goal: '分析打包依赖，按需动态加载高耗时模块并验证基准耗时', mode: 'autonomous' as const },
]

export function MissionHub({
  projectName,
  projectPath,
  onOpenSettings,
  onOpenWorkbenchTarget,
}: {
  projectName: string
  projectPath?: string
  onOpenSettings?: () => void
  onOpenWorkbenchTarget?: (target: ArtifactWorkbenchTarget) => void
}) {
  const [activeTab, setActiveTab] = useState<HubTab>('kanban')
  const [mission, setMission] = useState<SuperagentMission | null>(null)
  const [missionsList, setMissionsList] = useState<SuperagentMission[]>([])
  const [tickets, setTickets] = useState<OrchestratedTicket[]>([])
  const [runs, setRuns] = useState<RunWorkspaceRun[]>([])
  const [executionEvents, setExecutionEvents] = useState<PersistedExecutionEvent[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [v2ActiveRunId, setV2ActiveRunId] = useState<string | null>(null)
  const [goalInput, setGoalInput] = useState('')
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('autonomous')
  const [dispatching, setDispatching] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<OrchestratedTicket | null>(null)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [actionNotice, setActionNotice] = useState<{ type: 'info' | 'error' | 'success'; text: string } | null>(null)

  // Fetch missions, tickets and active runs in one unified loop
  const syncMissionData = useCallback(async () => {
    try {
      const [orchestrateRes, runsRes] = await Promise.all([
        fetch('/api/orchestrate').then(r => r.ok ? r.json() : null),
        fetch('/api/runs').then(r => r.ok ? r.json() : []),
      ])

      if (orchestrateRes) {
        if (orchestrateRes.mission) setMission(orchestrateRes.mission)
        if (Array.isArray(orchestrateRes.tickets)) setTickets(orchestrateRes.tickets)
        if (Array.isArray(orchestrateRes.missions)) setMissionsList(orchestrateRes.missions)
      }

      if (Array.isArray(runsRes)) {
        setRuns(runsRes)
        if (!activeRunId && runsRes.length > 0) {
          const running = runsRes.find(r => ['running', 'preparing', 'awaiting_approval'].includes(r.status))
          setActiveRunId(running ? running.id : runsRes[0].id)
        }
      }
    } catch {
      // Background sync non-blocking
    }
  }, [activeRunId])

  useEffect(() => {
    syncMissionData()
    const timer = setInterval(syncMissionData, 2500)
    return () => clearInterval(timer)
  }, [syncMissionData])

  const activeRun = useMemo(() => {
    return runs.find(r => r.id === (v2ActiveRunId || mission?.runId || activeRunId)) || runs[0] || null
  }, [runs, mission, activeRunId, v2ActiveRunId])

  useEffect(() => {
    if (!activeRun?.id) { setExecutionEvents([]); return }
    let cancelled = false
    const loadTimeline = async () => {
      try {
        const response = await fetch(`/api/runs/${encodeURIComponent(activeRun.id)}/timeline?limit=1000`)
        if (!response.ok) return
        const data = await response.json() as { events?: PersistedExecutionEvent[] }
        if (!cancelled && Array.isArray(data.events)) setExecutionEvents(data.events)
      } catch { /* Timeline replay is retried on the next refresh. */ }
    }
    void loadTimeline()
    const timer = window.setInterval(loadTimeline, 2500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [activeRun?.id])

  // Single Core Action: Dispatch New Mission through Superagent
  const handleStartMission = async (customGoal?: string, customMode?: ExecutionMode) => {
    const targetGoal = (customGoal || goalInput).trim()
    if (!targetGoal) return

    setDispatching(true)
    setActionNotice(null)
    const targetMode = customMode || executionMode

    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decompose', goal: targetGoal, mode: targetMode }),
      })
      if (!res.ok) throw new Error('Superagent 目标分解失败')
      const data = await res.json()

      if (data.mission) {
        setMission(data.mission)
        if (targetMode === 'autonomous') {
          // Autonomous execution trigger
          const dispatchRes = await fetch('/api/orchestrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'dispatch', missionId: data.mission.id }),
          })
          if (dispatchRes.ok) {
            const dispData = await dispatchRes.json()
            if (dispData.run?.id) setActiveRunId(dispData.run.id)
          }
        }
      }
      if (Array.isArray(data.tickets)) setTickets(data.tickets)
      setGoalInput('')
      setActionNotice({ type: 'success', text: `Superagent 已完成任务拆解！共生成 ${data.tickets?.length || 0} 个阶段性执行卡片` })
      await syncMissionData()
    } catch (err) {
      setActionNotice({ type: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setDispatching(false)
    }
  }

  // Gate Approval
  const handleApproveGate = async (ticket: OrchestratedTicket) => {
    setActionNotice(null)
    try {
      const runId = ticket.runId || mission?.runId || activeRun?.id
      if (runId) {
        await fetch('/api/orchestrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve_gate', runId }),
        })
      }
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, stage: 'completed', progress: 100 } : t))
      setActionNotice({ type: 'success', text: `审批门禁「${ticket.title}」已放行，后续 Worker 继续推进` })
      await syncMissionData()
    } catch (err) {
      setActionNotice({ type: 'error', text: err instanceof Error ? err.message : String(err) })
    }
  }

  // Dynamic Re-plan by Superagent
  const handleReplan = async (ticket: OrchestratedTicket) => {
    if (!mission) return
    setActionNotice(null)
    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'replan', missionId: mission.id, ticketId: ticket.id, reason: '操作员干预重新规划' }),
      })
      if (!res.ok) throw new Error('重新编排失败')
      const data = await res.json()
      if (data.tickets) setTickets(data.tickets)
      setActionNotice({ type: 'info', text: 'Superagent 已重新编排后续路径并插入自愈补丁任务' })
      await syncMissionData()
    } catch (err) {
      setActionNotice({ type: 'error', text: err instanceof Error ? err.message : String(err) })
    }
  }

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter(ticket => {
      if (roleFilter !== 'all' && ticket.workerRole !== roleFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return ticket.title.toLowerCase().includes(q) || ticket.description.toLowerCase().includes(q) || ticket.branch.toLowerCase().includes(q)
      }
      return true
    })
  }, [tickets, roleFilter, searchQuery])

  // Aggregate HUD stats
  const stats = useMemo(() => {
    const total = tickets.length
    const inProgress = tickets.filter(t => t.stage === 'in_progress').length
    const gate = tickets.filter(t => t.stage === 'gate').length
    const completed = tickets.filter(t => t.stage === 'completed').length
    const blocked = tickets.filter(t => t.stage === 'blocked').length
    const rate = total ? Math.round((completed / total) * 100) : 0
    return { total, inProgress, gate, completed, blocked, rate }
  }, [tickets])

  const pendingGateTicket = useMemo(() => {
    return tickets.find(t => t.stage === 'gate')
  }, [tickets])

  const roleLabels: Record<AgentRole, { label: string; icon: typeof Bot; class: string }> = {
    router: { label: 'Router 调度', icon: Compass, class: 'router' },
    architect: { label: 'Architect 规格', icon: BrainCircuit, class: 'architect' },
    coder: { label: 'Coding 实施', icon: FileCode, class: 'coder' },
    validator: { label: 'QA 验证', icon: CheckCircle2, class: 'validator' },
    reviewer: { label: 'Reviewer 审查', icon: ShieldCheck, class: 'reviewer' },
    security: { label: 'Gatekeeper 准入', icon: ShieldAlert, class: 'security' },
  }

  return (
    <div className="mission-hub-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 1. Global Command Deck & Unified Entrance */}
      <header className="hub-command-deck" style={{ padding: '16px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <div className="hub-command-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="hub-project-meta" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="kanban-badge" style={{ background: 'linear-gradient(135deg, rgb(99 102 241 / 25%), rgb(129 140 248 / 15%))' }}>
              <Sparkles size={14} color="var(--purple)" /> 统一任务与研发中枢
            </span>
            <div className="hub-project-facts" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
              <span>项目：<strong style={{ color: 'var(--ink)' }}>{projectName}</strong></span>
              <span>·</span>
              <span>分支：<code style={{ color: 'var(--sky)' }}>{activeRun?.branchName || mission?.tickets[0]?.branch || 'main'}</code></span>
              <span>·</span>
              <span>模式：<span style={{ color: executionMode === 'autonomous' ? 'var(--emerald)' : executionMode === 'observe' ? 'var(--amber)' : 'var(--purple)' }}>{executionMode === 'autonomous' ? '⚡ 自主全自动' : executionMode === 'observe' ? '👁️ 观察模式' : '🛡️ 严格门禁'}</span></span>
            </div>
          </div>

          <div className="hub-command-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="card-action-btn"
              onClick={() => setShowTemplateModal(true)}
              title="查看预设研发模板"
            >
              <Workflow size={13} /> 常用任务模板
            </button>
            <button
              type="button"
              className="card-action-btn"
              onClick={() => setShowHistoryModal(true)}
              title="切换历史任务"
            >
              <History size={13} /> 任务历史 ({runs.length})
            </button>
            {onOpenSettings && (
              <button
                type="button"
                className="header-icon-button"
                onClick={onOpenSettings}
                title="项目与环境设置"
              >
                <Settings size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Unified Fast Mission Dispatcher */}
        <div className="hub-dispatch-row" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <Bot size={18} style={{ position: 'absolute', left: 14, color: 'var(--purple)', pointerEvents: 'none' }} />
            <input
              type="text"
              className="dispatch-input"
              style={{ width: '100%', padding: '10px 14px 10px 42px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', fontSize: 13 }}
              placeholder="输入你的业务目标或修复需求（例如：重构用户认证体系、修复支付弹窗滚动失效、增加性能基准测试）..."
              value={goalInput}
              onChange={e => setGoalInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleStartMission() }}
            />
          </div>

          <div className="mode-selector">
            <button
              type="button"
              className={`mode-btn ${executionMode === 'autonomous' ? 'active' : ''}`}
              onClick={() => setExecutionMode('autonomous')}
              title="全自动执行：Superagent 自主调度并驱动 Worker"
            >
              <Play size={13} /> 自主执行
            </button>
            <button
              type="button"
              className={`mode-btn observe ${executionMode === 'observe' ? 'active' : ''}`}
              onClick={() => setExecutionMode('observe')}
              title="观察模式：Agent 规划出完整计划与受影响文件，停在门禁等待确认"
            >
              <Compass size={13} /> 观察模式
            </button>
            <button
              type="button"
              className={`mode-btn ${executionMode === 'gate_required' ? 'active' : ''}`}
              onClick={() => setExecutionMode('gate_required')}
              title="严格门禁：每项关键写操作均需授权"
            >
              <UserCheck size={13} /> 严格门禁
            </button>
          </div>

          <button
            type="button"
            className="dispatch-btn"
            disabled={dispatching || !goalInput.trim()}
            onClick={() => void handleStartMission()}
          >
            {dispatching ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {dispatching ? 'Agent 正在编排...' : '启动智能任务'}
          </button>
        </div>

        {/* Notification Toast */}
        {actionNotice && (
          <div style={{
            marginTop: 10,
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: actionNotice.type === 'error' ? 'var(--rose-soft)' : actionNotice.type === 'success' ? 'var(--emerald-soft)' : 'var(--indigo-soft)',
            color: actionNotice.type === 'error' ? 'var(--rose)' : actionNotice.type === 'success' ? 'var(--emerald)' : 'var(--purple)',
            border: `1px solid ${actionNotice.type === 'error' ? 'rgba(248,113,113,0.3)' : actionNotice.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(99,102,241,0.3)'}`,
          }}>
            <span>{actionNotice.text}</span>
            <button type="button" onClick={() => setActionNotice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
              <X size={14} />
            </button>
          </div>
        )}
      </header>

      {/* 2. Gatekeeper Alert Banner (when human action required) */}
      {pendingGateTicket && (
        <div className="hub-gate-banner" style={{
          padding: '10px 24px',
          background: 'linear-gradient(90deg, rgb(245 158 11 / 15%), rgb(245 158 11 / 5%))',
          borderBottom: '1px solid rgb(245 158 11 / 30%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div className="hub-gate-copy" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldAlert size={18} color="var(--amber)" />
            <div>
              <strong style={{ color: 'var(--amber)', fontSize: 13 }}>等待人工安全审批：{pendingGateTicket.title}</strong>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text)' }}>{pendingGateTicket.description}</p>
            </div>
          </div>
          <div className="hub-gate-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="card-action-btn"
              onClick={() => setSelectedTicket(pendingGateTicket)}
            >
              查看准入范围
            </button>
            <button
              type="button"
              className="card-action-btn approve"
              onClick={() => handleApproveGate(pendingGateTicket)}
            >
              <CheckCircle2 size={13} /> 立即批准放行
            </button>
          </div>
        </div>
      )}

      {/* 3. Unified Product Navigation Tabs & Stats HUD */}
      <div className="hub-tabbar">
        {/* Core View Switchers */}
        <div className="hub-tab-list" role="tablist" aria-label="任务中枢视图">
          <button
            type="button"
            role="tab"
            className={`hub-view-tab ${activeTab === 'kanban' ? 'active' : ''}`}
            aria-selected={activeTab === 'kanban'}
            onClick={() => setActiveTab('kanban')}
          >
            <LayoutGrid size={16} aria-hidden="true" />
            <span className="hub-view-tab-copy"><strong>进度看板</strong><small>Kanban</small></span>
            <span className="hub-view-tab-count">{stats.total}</span>
          </button>

          <button
            type="button"
            role="tab"
            className={`hub-view-tab ${activeTab === 'v2-plan' ? 'active' : ''}`}
            aria-selected={activeTab === 'v2-plan'}
            onClick={() => setActiveTab('v2-plan')}
          >
            <Workflow size={16} aria-hidden="true" />
            <span className="hub-view-tab-copy"><strong>V2 计划图</strong><small>Mission / Plan</small></span>
          </button>

          <button
            type="button"
            role="tab"
            className={`hub-view-tab ${activeTab === 'timeline' ? 'active' : ''}`}
            aria-selected={activeTab === 'timeline'}
            onClick={() => setActiveTab('timeline')}
          >
            <Layers size={16} aria-hidden="true" />
            <span className="hub-view-tab-copy"><strong>执行追踪</strong><small>Live Trace</small></span>
          </button>

          <button
            type="button"
            role="tab"
            className={`hub-view-tab ${activeTab === 'diff' ? 'active' : ''}`}
            aria-selected={activeTab === 'diff'}
            onClick={() => setActiveTab('diff')}
          >
            <FileDiff size={16} aria-hidden="true" />
            <span className="hub-view-tab-copy"><strong>代码审查</strong><small>Diff</small></span>
          </button>

          <button
            type="button"
            role="tab"
            className={`hub-view-tab ${activeTab === 'artifacts' ? 'active' : ''}`}
            aria-selected={activeTab === 'artifacts'}
            onClick={() => setActiveTab('artifacts')}
          >
            <Package size={16} aria-hidden="true" />
            <span className="hub-view-tab-copy"><strong>交付物库</strong><small>Artifacts</small></span>
            <span className="hub-view-tab-count">{activeRun?.artifacts?.length || 0}</span>
          </button>

          <button
            type="button"
            role="tab"
            className={`hub-view-tab ${activeTab === 'terminal' ? 'active' : ''}`}
            aria-selected={activeTab === 'terminal'}
            onClick={() => setActiveTab('terminal')}
          >
            <Terminal size={16} aria-hidden="true" />
            <span className="hub-view-tab-copy"><strong>终端与文件</strong><small>Workbench</small></span>
          </button>
        </div>

        {/* Live Metrics HUD */}
        <div className="hub-metrics" aria-label="任务统计">
          <div className="hud-stat-pill" style={{ padding: '4px 8px', minWidth: 54 }}>
            <span>执行中</span>
            <strong style={{ color: 'var(--sky)', fontSize: 13 }}>{stats.inProgress}</strong>
          </div>
          <div className="hud-stat-pill" style={{ padding: '4px 8px', minWidth: 54 }}>
            <span>门禁中</span>
            <strong style={{ color: 'var(--amber)', fontSize: 13 }}>{stats.gate}</strong>
          </div>
          <div className="hud-stat-pill" style={{ padding: '4px 8px', minWidth: 54 }}>
            <span>已交付</span>
            <strong style={{ color: 'var(--emerald)', fontSize: 13 }}>{stats.completed} ({stats.rate}%)</strong>
          </div>
          <button
            type="button"
            className="header-icon-button"
            onClick={syncMissionData}
            title="刷新数据"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* 4. Tab Content Area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'v2-plan' && <MissionPlanPanel onRunStarted={runId => { setV2ActiveRunId(runId); setActiveTab('timeline') }} />}
        {/* Tab 1: Kanban Board View */}
        {activeTab === 'kanban' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="kanban-toolbar">
              <div className="kanban-filters">
                <div className="filter-chip-group">
                  <span style={{ color: 'var(--quiet)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Filter size={13} /> 角色过滤:
                  </span>
                  <button
                    type="button"
                    className={`filter-chip ${roleFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setRoleFilter('all')}
                  >
                    全部
                  </button>
                  {(Object.keys(roleLabels) as AgentRole[]).map(role => (
                    <button
                      key={role}
                      type="button"
                      className={`filter-chip ${roleFilter === role ? 'active' : ''}`}
                      onClick={() => setRoleFilter(role)}
                    >
                      {roleLabels[role].label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={12} style={{ position: 'absolute', left: 8, color: 'var(--quiet)' }} />
                  <input
                    type="text"
                    placeholder="按关键词/分支搜索..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ padding: '4px 8px 4px 26px', fontSize: 11, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--ink)' }}
                  />
                </div>
              </div>
            </div>

            <div className="kanban-columns-container">
              {stageColumns.map(col => {
                const colTickets = filteredTickets.filter(t => t.stage === col.id)
                const ColIcon = col.icon

                return (
                  <div className="kanban-column" key={col.id}>
                    <div className="column-header">
                      <div className="column-header-title">
                        <ColIcon size={14} style={{ color: col.color }} aria-hidden="true" />
                        <span>{col.label}</span>
                      </div>
                      <span className="column-count">{colTickets.length}</span>
                    </div>

                    <div className="column-cards-list">
                      {colTickets.length === 0 ? (
                        <div className="column-empty">
                          <span>暂无此类卡片</span>
                        </div>
                      ) : (
                        colTickets.map(ticket => {
                          const roleInfo = roleLabels[ticket.workerRole] || roleLabels.coder
                          const RoleIcon = roleInfo.icon

                          return (
                            <article
                              key={ticket.id}
                              className={`ticket-card ${ticket.stage}`}
                              onClick={() => setSelectedTicket(ticket)}
                            >
                              <div className="ticket-card-header">
                                <span className={`worker-role-pill ${roleInfo.class}`}>
                                  <RoleIcon size={11} /> {roleInfo.label}
                                </span>
                                <span className="ticket-branch-tag">
                                  <GitBranch size={10} /> {(ticket.branch || '').slice(-12)}
                                </span>
                              </div>

                              <h3 className="ticket-title">{ticket.title}</h3>
                              <p className="ticket-desc">{ticket.description}</p>

                              {ticket.activeToolCall && (
                                <div className="ticket-active-tool">
                                  <span className="pulse-dot" />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {ticket.activeToolCall.tool}
                                    {ticket.activeToolCall.argument ? `: ${ticket.activeToolCall.argument}` : ''}
                                  </span>
                                </div>
                              )}

                              {ticket.deliverables && ticket.deliverables.length > 0 && (
                                <div className="ticket-deliverables">
                                  {ticket.deliverables.map(del => (
                                    <span key={del.id} className="deliverable-tag">
                                      <FileCode size={10} /> {del.name}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="ticket-footer">
                                <span>{ticket.executorId.toUpperCase()}</span>
                                <div className="ticket-actions" onClick={e => e.stopPropagation()}>
                                  {ticket.stage === 'gate' && (
                                    <button
                                      type="button"
                                      className="card-action-btn approve"
                                      onClick={() => handleApproveGate(ticket)}
                                    >
                                      批准通过
                                    </button>
                                  )}
                                  {ticket.stage === 'blocked' && (
                                    <button
                                      type="button"
                                      className="card-action-btn replan"
                                      onClick={() => handleReplan(ticket)}
                                    >
                                      重新规划
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="card-action-btn"
                                    onClick={() => setSelectedTicket(ticket)}
                                  >
                                    详情
                                  </button>
                                </div>
                              </div>
                            </article>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Execution Timeline & Live Trace */}
        {activeTab === 'timeline' && (
          <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--ink)', fontSize: 16 }}>实时执行时序与 Agent 思考轨迹</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>
                  当前任务：{activeRun?.mission?.missionTitle || activeRun?.workflow?.workflowName || mission?.goal || '自主规划流'}{activeRun?.mission ? ` · Plan r${activeRun.mission.planRevision}` : ''} (ID: {activeRun?.id || mission?.id || '—'})
                </p>
              </div>
              <span className={`status-pill ${activeRun?.status === 'succeeded' ? 'valid' : activeRun?.status === 'failed' ? 'failed' : 'pending'}`}>
                {activeRun?.status || '就绪'}
              </span>
            </div>

            {executionEvents.length > 0 || (activeRun?.events?.length ?? 0) > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(executionEvents.length ? executionEvents.map(event => ({
                  id: event.id,
                  occurredAt: event.occurredAt,
                  type: event.kind,
                  message: event.payload?.message ?? event.kind,
                  details: event.payload?.details,
                })) : activeRun?.events ?? []).map(ev => (
                  <div
                    key={ev.id}
                    style={{
                      padding: '12px 16px',
                      background: 'var(--card)',
                      borderRadius: 8,
                      border: '1px solid var(--line)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--quiet)', fontFamily: 'var(--mono)', minWidth: 68 }}>
                      {new Date(ev.occurredAt).toLocaleTimeString('zh-CN')}
                    </span>
                    <span className="worker-role-pill coder" style={{ fontSize: 10 }}>
                      {ev.type}
                    </span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: 13, color: 'var(--ink)' }}>{ev.message}</strong>
                      {ev.details && (
                        <pre style={{ margin: '6px 0 0', fontSize: 11, background: 'var(--canvas)', padding: 8, borderRadius: 6, color: 'var(--muted)' }}>
                          {JSON.stringify(ev.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--quiet)' }}>
                <BrainCircuit size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <p>启动任务后，Agent 的逐步思考、工具调用与日志将在这里实时流式呈现。</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Git Diff & Code Delivery Review */}
        {activeTab === 'diff' && (
          <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--ink)', fontSize: 16 }}>代码交付审查与 Git Diff 状态</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>
                  目标分支：{activeRun?.branchName || 'agent/active-worktree'} · 隔离隔离目录已保护
                </p>
              </div>
            </div>

            {activeRun?.deliveryApproval?.changedFiles?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ padding: 14, background: 'var(--card)', borderRadius: 8, border: '1px solid var(--line)' }}>
                  <strong style={{ color: 'var(--ink)' }}>变更文件清单 ({activeRun.deliveryApproval.changedFiles.length} 个文件)</strong>
                  <ul style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 12, color: 'var(--sky)' }}>
                    {activeRun.deliveryApproval.changedFiles.map((file, idx) => (
                      <li key={idx}><code>{file}</code></li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--quiet)' }}>
                <FileDiff size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <p>Coding Worker 完成代码编辑后，将在此生成可审核的 Git Diff 变动对比。</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Artifacts & Deliverables Registry */}
        {activeTab === 'artifacts' && (
          <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--ink)', fontSize: 16 }}>任务产出与交付档案 (Artifacts)</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>
                  带有 SHA-256 哈希校验、Schema 结构化验证与可溯源血缘的交付产物
                </p>
              </div>
            </div>

            {activeRun?.artifacts && activeRun.artifacts.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {activeRun.artifacts.map(art => (
                  <article key={art.id} className="artifact-card valid">
                    <header>
                      <span className="artifact-card-icon"><Package size={14} /></span>
                      <div>
                        <span className="section-kicker">节点 · {art.nodeId}</span>
                        <h2>{art.type} <small>v{art.version}</small></h2>
                      </div>
                      <em className="status-pill valid">{art.status}</em>
                    </header>
                    <dl className="artifact-card-meta">
                      <div><dt>Schema</dt><dd>{art.schemaId} v{art.schemaVersion}</dd></div>
                      <div><dt>哈希</dt><dd><code>{(art.contentHash || '').slice(0, 12)}</code></dd></div>
                    </dl>
                    {onOpenWorkbenchTarget && (
                      <footer>
                        <button
                          type="button"
                          className="ghost-btn"
                          style={{ width: '100%', justifyContent: 'center' }}
                          onClick={() => onOpenWorkbenchTarget({ runId: activeRun.id, artifactId: art.id })}
                        >
                          在工作台中查阅产物
                        </button>
                      </footer>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--quiet)' }}>
                <Package size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <p>当前任务尚未生成产物。随着 Agent 阶段完成，规格书、测试报告将自动入库。</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Inline Workbench & Terminal */}
        {activeTab === 'terminal' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <TerminalWorkbench active={activeTab === 'terminal'} projectPath={projectPath} />
          </div>
        )}
      </div>

      {/* Ticket Details Slide-out Drawer */}
      {selectedTicket && (
        <div className="kanban-drawer-backdrop" onClick={() => setSelectedTicket(null)}>
          <aside className="kanban-drawer" onClick={e => e.stopPropagation()}>
            <header className="drawer-header">
              <div>
                <span className={`worker-role-pill ${roleLabels[selectedTicket.workerRole]?.class || 'coder'}`}>
                  {roleLabels[selectedTicket.workerRole]?.label || 'Worker'}
                </span>
                <h2 style={{ fontSize: 16, color: 'var(--ink)', margin: '8px 0 4px' }}>
                  {selectedTicket.title}
                </h2>
                <span style={{ fontSize: 12, color: 'var(--quiet)', fontFamily: 'var(--mono)' }}>
                  ID: {selectedTicket.id} · 分支: {selectedTicket.branch}
                </span>
              </div>
              <button
                type="button"
                className="header-icon-button"
                onClick={() => setSelectedTicket(null)}
              >
                <X size={18} />
              </button>
            </header>

            <div className="drawer-body">
              <div className="drawer-section">
                <span className="drawer-section-title">任务指令与详细描述</span>
                <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, margin: 0 }}>
                  {selectedTicket.description}
                </p>
              </div>

              <div className="drawer-section">
                <span className="drawer-section-title">验收准则 (Acceptance Criteria)</span>
                <ul className="criteria-list">
                  {selectedTicket.acceptanceCriteria.map((crit, idx) => (
                    <li key={idx} className="criteria-item">
                      <span className="criteria-dot" />
                      <span>{crit}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {selectedTicket.activeToolCall && (
                <div className="drawer-section">
                  <span className="drawer-section-title">实时执行中 Tool / Action</span>
                  <div className="ticket-active-tool">
                    <span className="pulse-dot" />
                    <strong>{selectedTicket.activeToolCall.tool}</strong>
                    <span>{selectedTicket.activeToolCall.argument}</span>
                  </div>
                </div>
              )}

              {selectedTicket.deliverables && selectedTicket.deliverables.length > 0 && (
                <div className="drawer-section">
                  <span className="drawer-section-title">关联交付物 (Artifacts)</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedTicket.deliverables.map(del => (
                      <div
                        key={del.id}
                        style={{
                          padding: 10,
                          background: 'var(--card)',
                          borderRadius: 8,
                          border: '1px solid var(--line)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <FileCode size={16} color="var(--purple)" />
                          <div>
                            <strong style={{ fontSize: 12, color: 'var(--ink)' }}>{del.name}</strong>
                            <p style={{ margin: 0, fontSize: 11, color: 'var(--quiet)' }}>
                              类型: {del.type} {del.summary ? `· ${del.summary}` : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="drawer-section">
                <span className="drawer-section-title">执行环境与参数</span>
                <div style={{ fontSize: 12, color: 'var(--text)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>执行器：<code>{selectedTicket.executorId}</code></div>
                  <div>权限模式：<code>{selectedTicket.executionMode}</code></div>
                  <div>当前状态：<code>{selectedTicket.stage}</code></div>
                  <div>执行进度：<strong>{selectedTicket.progress ?? 0}%</strong></div>
                </div>
              </div>
            </div>

            <footer className="drawer-footer">
              <button
                type="button"
                className="card-action-btn replan"
                onClick={() => handleReplan(selectedTicket)}
              >
                Agent 动态重新编排
              </button>

              {selectedTicket.stage === 'gate' && (
                <button
                  type="button"
                  className="dispatch-btn"
                  onClick={() => handleApproveGate(selectedTicket)}
                >
                  <CheckCircle2 size={15} /> 批准门禁并放行
                </button>
              )}
            </footer>
          </aside>
        </div>
      )}

      {/* Preset Templates Modal */}
      {showTemplateModal && (
        <div className="kanban-drawer-backdrop" onClick={() => setShowTemplateModal(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 520,
              background: 'var(--surface)',
              borderRadius: 12,
              border: '1px solid var(--line)',
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              margin: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: 'var(--ink)', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Workflow size={18} color="var(--purple)" /> 预设研发与编排模板
              </h3>
              <button type="button" className="header-icon-button" onClick={() => setShowTemplateModal(false)}>
                <X size={16} />
              </button>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--muted)' }}>
              选择经典工程场景，Superagent 将直接加载最佳实践并自动拆解阶段任务：
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {presetGoals.map((p, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 12,
                    background: 'var(--card)',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s',
                  }}
                  onClick={() => {
                    setShowTemplateModal(false)
                    void handleStartMission(p.goal, p.mode)
                  }}
                >
                  <div>
                    <strong style={{ color: 'var(--ink)', fontSize: 13 }}>{p.label}</strong>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text)' }}>{p.goal}</p>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--purple)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    立即应用 <ArrowRight size={13} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* History Missions Modal */}
      {showHistoryModal && (
        <div className="kanban-drawer-backdrop" onClick={() => setShowHistoryModal(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 580,
              maxHeight: '80vh',
              background: 'var(--surface)',
              borderRadius: 12,
              border: '1px solid var(--line)',
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              margin: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: 'var(--ink)', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <History size={18} color="var(--purple)" /> 任务与运行历史
              </h3>
              <button type="button" className="header-icon-button" onClick={() => setShowHistoryModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {runs.map(r => (
                <div
                  key={r.id}
                  style={{
                    padding: 12,
                    background: activeRunId === r.id ? 'var(--indigo-soft)' : 'var(--card)',
                    border: `1px solid ${activeRunId === r.id ? 'var(--purple)' : 'var(--line)'}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onClick={() => {
                    setV2ActiveRunId(null)
                    setActiveRunId(r.id)
                    setShowHistoryModal(false)
                    setActionNotice({ type: 'info', text: `已载入历史任务 ${r.id}` })
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 13, color: 'var(--ink)' }}>{r.workflow?.workflowName || (r.input?.text ? r.input.text.slice(0, 36) : '') || r.id || '未知任务'}</strong>
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--quiet)' }}>
                      ID: {(r.id || '').slice(0, 16)} · 时间: {r.startedAt ? new Date(r.startedAt).toLocaleString('zh-CN') : '-'}
                    </p>
                  </div>
                  <span className={`status-pill ${r.status === 'succeeded' ? 'valid' : r.status === 'failed' ? 'failed' : 'pending'}`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
