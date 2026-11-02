'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AppWindow,
  Bot,
  Check,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FilePenLine,
  FileText,
  FolderCog,
  Globe2,
  LoaderCircle,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Sparkles,
  SquareTerminal,
  Workflow,
  X,
} from 'lucide-react'
import artifactLogo from './assets/artifact-logo.png'
import { ExecutorSettings, SettingsOverview } from './executor-settings'
import { readPreference, writePreference } from './preferences'
import { Workbench, type ArtifactWorkbenchTarget, type WorkbenchMode } from './workbench'
import { MissionHub } from './mission-hub'

type ProjectSummary = {
  name: string
  repositoryPath: string
  gitRoot: string
  status: 'detected' | 'ready' | 'invalid'
  environment: { version: number; confirmedByUser: boolean; commands: Record<string, unknown>; commandAllowlist: Record<string, unknown> }
}
type ExecutorOption = { id: string; name: string; connected: boolean; authentication: 'authenticated' | 'api_key' | 'needs_login' | 'unknown' }
type Artifact = {
  id: string
  nodeId: string
  type: string
  version?: number
  schemaId?: string
  schemaVersion?: number
  status: string
  contentHash: string
  createdAt: string
  inputArtifactIds?: string[]
  validationErrors?: string[]
}
type Run = {
  id: string
  status: string
  startedAt: string
  endedAt?: string
  worktreePath?: string
  branchName?: string
  workflow?: { workflowId: string; workflowName: string; revision: number; publishedAt: string }
  logs: string[]
  nodes: Array<{ id: string; kind?: string; outputType?: string; state: string }>
  artifacts: Artifact[]
}

type InterfaceTheme = 'system' | 'dark' | 'light'
type ResolvedTheme = Exclude<InterfaceTheme, 'system'>

const navItems = [
  { id: 'mission', label: '任务中枢', icon: Sparkles },
  { id: 'artifacts', label: '交付与产物', icon: Package },
  { id: 'workbench', label: '工程工作台', icon: AppWindow },
  { id: 'settings', label: '项目设置', icon: Settings },
]

const defaultSidebarWidth = 218
const minSidebarWidth = 190
const maxSidebarWidth = 360
const activeViewStorageKey = 'artifact.active-view'

export default function HomePage() {
  const [activeView, setActiveView] = useState('mission')
  const [theme, setTheme] = useState<InterfaceTheme>('dark')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark')
  const [themeReady, setThemeReady] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(defaultSidebarWidth)
  const [settingsPage, setSettingsPage] = useState<'overview' | 'executors'>('overview')
  const [executorOptions, setExecutorOptions] = useState<ExecutorOption[]>([])
  const [project, setProject] = useState<ProjectSummary | null>(null)
  const [projectLoading, setProjectLoading] = useState(true)
  const [workbenchMode, setWorkbenchMode] = useState<WorkbenchMode>('documents')
  const [workbenchTarget, setWorkbenchTarget] = useState<ArtifactWorkbenchTarget | undefined>(undefined)
  const [workbenchBrowserOpen, setWorkbenchBrowserOpen] = useState(false)

  const sidebarRef = useRef<HTMLElement>(null)
  const sidebarResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)

  const updateSidebarWidth = useCallback((value: number, persist = true) => {
    const next = Math.max(minSidebarWidth, Math.min(maxSidebarWidth, Math.round(value)))
    setSidebarWidth(next)
    if (persist) writePreference('artifact.sidebar-width', String(next))
  }, [])

  const startSidebarResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    sidebarResizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: sidebarWidth }
  }

  const resizeSidebar = (event: React.PointerEvent<HTMLButtonElement>) => {
    const resize = sidebarResizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    updateSidebarWidth(resize.startWidth + event.clientX - resize.startX, false)
  }

  const finishSidebarResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const resize = sidebarResizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    sidebarResizeRef.current = null
    updateSidebarWidth(sidebarWidth)
  }

  const selectView = useCallback((viewId: string) => {
    setActiveView(viewId)
    writePreference(activeViewStorageKey, viewId)
  }, [])

  const openArtifactWorkbench = useCallback((target: ArtifactWorkbenchTarget) => {
    setWorkbenchTarget(target)
    setWorkbenchMode('documents')
    selectView('workbench')
  }, [selectView])

  useEffect(() => {
    const saved = readPreference(activeViewStorageKey)
    if (saved && navItems.some(item => item.id === saved)) setActiveView(saved)
  }, [])

  useEffect(() => {
    const savedTheme = (readPreference('artifact.theme') as InterfaceTheme) || 'dark'
    setTheme(savedTheme)
    const resolve = (pref: InterfaceTheme): ResolvedTheme =>
      pref === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : pref
    setResolvedTheme(resolve(savedTheme))
    setThemeReady(true)
  }, [])

  useEffect(() => {
    if (!themeReady) return
    const resolved = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme
    setResolvedTheme(resolved)
    document.documentElement.dataset.theme = resolved
    document.documentElement.dataset.themePreference = theme
    document.documentElement.style.colorScheme = resolved
    writePreference('artifact.theme', theme)
  }, [theme, themeReady])

  const loadProject = useCallback(() => {
    void fetch('/api/project')
      .then(response => response.ok ? response.json() : null)
      .then((data: { project?: ProjectSummary | null } | ProjectSummary | null) => {
        if (!data) {
          setProject(null)
          return
        }
        if ('project' in data && data.project !== undefined) {
          setProject(data.project)
        } else {
          setProject(data as ProjectSummary)
        }
      })
      .catch(() => setProject(null))
      .finally(() => setProjectLoading(false))
  }, [])

  const loadExecutors = useCallback(() => {
    void fetch('/api/executors/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ includeLatest: false }) })
      .then(response => response.ok ? response.json() : null)
      .then((data: { executors?: ExecutorOption[] } | null) => setExecutorOptions(data?.executors ?? []))
      .catch(() => setExecutorOptions([]))
  }, [])

  useEffect(() => {
    loadProject()
    loadExecutors()
    window.addEventListener('artifact-project-updated', loadProject)
    window.addEventListener('artifact-executors-updated', loadExecutors)
    return () => {
      window.removeEventListener('artifact-project-updated', loadProject)
      window.removeEventListener('artifact-executors-updated', loadExecutors)
    }
  }, [loadProject, loadExecutors])

  const projectName = project?.name || '当前代码库'
  const activeNavItem = navItems.find(item => item.id === activeView)

  return (
    <div className="app-shell" data-theme={resolvedTheme} data-theme-preference={theme}>
      <aside className="activity-bar" aria-label="应用功能导航">
        <div className="activity-brand" title="Artifact">
          <img src={artifactLogo.src} alt="Artifact Logo" className="brand-logo" />
        </div>
        <nav className="activity-nav" aria-label="主要视图">
          {navItems.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                title={item.label}
                aria-label={item.label}
                aria-current={activeView === item.id ? 'page' : undefined}
                className={activeView === item.id ? 'activity-item active' : 'activity-item'}
                onClick={() => selectView(item.id)}
              >
                <Icon aria-hidden="true" />
              </button>
            )
          })}
        </nav>
        <div className="activity-bottom">
          <button
            className="activity-item"
            title="收起或展开侧栏"
            aria-label="收起或展开侧栏"
            onClick={() => setSidebarCollapsed(prev => !prev)}
          >
            {sidebarCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          </button>
        </div>
      </aside>

      <aside
        ref={sidebarRef}
        className={sidebarCollapsed ? 'sidebar collapsed' : 'sidebar'}
        style={{ width: sidebarWidth }}
        aria-label="侧边栏"
      >
        <div className="side-brand">
          <span className="brand-name">artifact</span>
          <span className="beta">AI SUPERAGENT</span>
        </div>
        <div className="project-switcher">
          <span className="project-avatar">{project?.name ? project.name.slice(0, 1).toUpperCase() : <Plus aria-hidden="true" />}</span>
          <span>
            <b>{projectName}</b>
            <small>{project ? '工作树就绪' : projectLoading ? '正在加载...' : '未关联项目'}</small>
          </span>
        </div>
        <div className="side-label">{activeNavItem?.label}</div>
        <div className="sidebar-context">
          {activeView === 'mission' && (
            <div className="context-summary">
              <span className="context-icon"><Sparkles aria-hidden="true" /></span>
              <div>
                <b>任务指挥中枢</b>
                <small>Agent 智能编排 · 进度看板与交付</small>
              </div>
            </div>
          )}
          {activeView === 'artifacts' && (
            <>
              <div className="context-summary">
                <span className="context-icon"><Package aria-hidden="true" /></span>
                <div>
                  <b>交付与产物库</b>
                  <small>版本化交付物与 Schema 校验记录</small>
                </div>
              </div>
              <button className="context-action" onClick={() => selectView('mission')}>
                返回任务中枢 <ChevronRight aria-hidden="true" />
              </button>
            </>
          )}
          {activeView === 'workbench' && (
            <>
              <button className={`context-item ${workbenchMode === 'documents' ? 'active' : ''}`} onClick={() => setWorkbenchMode('documents')}>
                <span className="context-icon"><FileText aria-hidden="true" /></span>
                <span><b>文档与代码</b><small>项目文件编辑与预览</small></span>
              </button>
              <button className={`context-item ${workbenchMode === 'terminal' ? 'active' : ''}`} onClick={() => setWorkbenchMode('terminal')}>
                <span className="context-icon"><SquareTerminal aria-hidden="true" /></span>
                <span><b>交互终端</b><small>当前项目 Shell</small></span>
              </button>
              <button className={`context-item ${workbenchBrowserOpen ? 'active' : ''}`} onClick={() => setWorkbenchBrowserOpen(v => !v)}>
                <span className="context-icon"><Globe2 aria-hidden="true" /></span>
                <span><b>实时预览</b><small>固定显示在右侧</small></span>
              </button>
            </>
          )}
          {activeView === 'settings' && (
            <>
              <button className={`context-item ${settingsPage === 'overview' ? 'active' : ''}`} onClick={() => setSettingsPage('overview')}>
                <span className="context-icon"><FolderCog aria-hidden="true" /></span>
                <span><b>项目与环境</b><small>代码库与命令白名单</small></span>
              </button>
              <button className={`context-item ${settingsPage === 'executors' ? 'active' : ''}`} onClick={() => setSettingsPage('executors')}>
                <span className="context-icon"><Bot aria-hidden="true" /></span>
                <span><b>AI 执行器</b><small>模型与连通性</small></span>
              </button>
            </>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="runtime"><span className="online" />本地运行时在线</div>
        </div>
      </aside>

      <button
        className="sidebar-resizer"
        type="button"
        role="separator"
        aria-label="调整侧栏宽度"
        tabIndex={sidebarCollapsed ? -1 : 0}
        onPointerDown={startSidebarResize}
        onPointerMove={resizeSidebar}
        onPointerUp={finishSidebarResize}
      />

      <main className="workspace">
        <header className="workspace-header">
          <div className="header-leading">
            <div className="breadcrumb">
              <span>{projectName}</span>
              <i>/</i>
              <b>{activeNavItem?.label}</b>
            </div>
          </div>
          <div className="header-actions">
            <span className="header-runtime-badge ready" title="本地运行时就绪">
              <i />运行时就绪
            </span>
            {activeView !== 'mission' && (
              <button className="run-btn header-run-trigger" type="button" onClick={() => selectView('mission')}>
                <Sparkles aria-hidden="true" />任务中枢
              </button>
            )}
          </div>
        </header>

        {activeView === 'mission' ? (
          <MissionHub
            projectName={projectName}
            projectPath={project?.repositoryPath}
            onOpenSettings={() => selectView('settings')}
            onOpenWorkbenchTarget={target => openArtifactWorkbench(target)}
          />
        ) : activeView === 'artifacts' ? (
          <ArtifactView onEdit={openArtifactWorkbench} />
        ) : activeView === 'workbench' ? (
          <Workbench
            mode={workbenchMode}
            onModeChange={setWorkbenchMode}
            projectPath={project?.repositoryPath}
            target={workbenchTarget}
            browserOpen={workbenchBrowserOpen}
            onBrowserOpenChange={setWorkbenchBrowserOpen}
          />
        ) : settingsPage === 'executors' ? (
          <ExecutorSettings onBack={() => setSettingsPage('overview')} />
        ) : (
          <SettingsOverview
            onExecutors={() => setSettingsPage('executors')}
            onOpenWorkflow={() => selectView('mission')}
            executorConfigured={executorOptions.some(executor => executor.connected)}
            theme={theme}
            onThemeChange={setTheme}
          />
        )}

        <footer className="status-bar">
          <div className="status-group">
            <span className="status-item project-status"><i />{projectName}</span>
            <span className="status-item">Superagent 核心架构就绪</span>
          </div>
          <div className="status-group">
            <span className="status-item">本地运行时</span>
            <span className="status-item">Artifact 0.2.0</span>
          </div>
        </footer>
      </main>
    </div>
  )
}

function ArtifactView({ onEdit }: { onEdit: (target: ArtifactWorkbenchTarget) => void }) {
  type RegistryArtifact = Artifact & {
    runId: string
    runStartedAt: string
    workflow?: Run['workflow']
    node?: Pick<Run['nodes'][number], 'id' | 'kind' | 'outputType' | 'state'>
  }
  const [artifacts, setArtifacts] = useState<RegistryArtifact[]>([])
  const [status, setStatus] = useState('all')
  const [detail, setDetail] = useState<{ artifact: RegistryArtifact; payload: unknown } | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const copyTimerRef = useRef<number | null>(null)

  const load = useCallback(() => {
    void fetch('/api/runs')
      .then(response => response.ok ? response.json() : [])
      .then((runs: Run[]) => setArtifacts(runs.flatMap(run => (run.artifacts ?? []).map(artifact => ({
        ...artifact,
        runId: run.id,
        runStartedAt: run.startedAt,
        workflow: run.workflow,
        node: run.nodes.find(node => node.id === artifact.nodeId),
      })))))
  }, [])

  useEffect(() => { load(); const timer = window.setInterval(load, 3000); return () => window.clearInterval(timer) }, [load])
  useEffect(() => () => { if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current) }, [])

  const artifactKey = (artifact: RegistryArtifact) => `${artifact.runId}:${artifact.id}`
  const artifactUri = (artifact: RegistryArtifact) => `artifact://${artifact.runId}/${artifact.id}`
  const statusTone = (artifact: RegistryArtifact) => artifact.status === 'valid' ? 'valid' : artifact.status === 'invalid' || artifact.status === 'rejected' ? 'failed' : 'pending'
  const shortRunId = (runId?: string) => (runId && runId.length > 12) ? `${runId.slice(0, 12)}` : (runId || '')
  const formatTime = (value: string) => new Date(value).toLocaleString('zh-CN')

  const readPayload = async (artifact: RegistryArtifact) => {
    if (detail && artifactKey(detail.artifact) === artifactKey(artifact)) return detail.payload
    const response = await fetch(`/api/runs/${artifact.runId}/artifacts/${artifact.id}`)
    if (!response.ok) throw new Error('无法读取此 Artifact。')
    return response.json()
  }

  const open = async (artifact: RegistryArtifact) => {
    setActionError(null)
    try {
      setDetail({ artifact, payload: await readPayload(artifact) })
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '无法读取此 Artifact。')
    }
  }

  const copyArtifactUri = async (artifact: RegistryArtifact) => {
    if (!navigator.clipboard?.writeText) { setActionError('当前环境不支持复制。'); return }
    try {
      await navigator.clipboard.writeText(artifactUri(artifact))
      const key = artifactKey(artifact)
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
      setCopiedKey(key)
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(current => current === key ? null : current), 1500)
    } catch {
      setActionError('复制失败。')
    }
  }

  const downloadArtifact = async (artifact: RegistryArtifact) => {
    setActionError(null)
    try {
      const payload = await readPayload(artifact)
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${artifact.id}.json`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '下载 Artifact 失败。')
    }
  }

  const filtered = status === 'all' ? artifacts : artifacts.filter(artifact => artifact.status === status)

  return (
    <section className="content-view artifact-registry" style={{ height: '100%', overflowY: 'auto', padding: 24 }}>
      <div className="view-heading artifact-registry-heading">
        <div>
          <span className="section-kicker">ARTIFACT REGISTRY</span>
          <h1>交付与产物库</h1>
          <p>Schema 结构化校验、SHA-256 哈希防篡改与完整上下文血缘追踪。</p>
        </div>
        <label className="table-filter">
          状态
          <select value={status} onChange={event => setStatus(event.target.value)}>
            <option value="all">全部状态</option>
            <option value="valid">已验证</option>
            <option value="awaiting_approval">待审批</option>
            <option value="invalid">无效</option>
          </select>
        </label>
      </div>

      <div className="stats-row artifact-stats">
        <div><span>总产物</span><strong>{artifacts.length}</strong></div>
        <div><span>已验证</span><strong className="green-text">{artifacts.filter(item => item.status === 'valid').length}</strong></div>
        <div><span>待审批</span><strong className="amber-text">{artifacts.filter(item => item.status === 'awaiting_approval').length}</strong></div>
      </div>

      {actionError && <div className="artifact-action-notice" role="alert">{actionError}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14, marginTop: 16 }}>
        {filtered.length ? filtered.map(artifact => (
          <article className={`artifact-card ${statusTone(artifact)}`} key={artifactKey(artifact)}>
            <header>
              <span className="artifact-card-icon"><Package aria-hidden="true" /></span>
              <div>
                <span className="section-kicker">节点 · {artifact.node?.id ?? artifact.nodeId}</span>
                <h2>{artifact.type} <small>v{artifact.version ?? 1}</small></h2>
              </div>
              <em className={`status-pill ${statusTone(artifact)}`}>{artifact.status}</em>
            </header>
            <dl className="artifact-card-meta">
              <div><dt>所属任务</dt><dd><code>{shortRunId(artifact.runId)}</code></dd></div>
              <div><dt>SHA-256</dt><dd><code>{(artifact.contentHash || '').slice(0, 14)}</code></dd></div>
              <div className="artifact-created-at"><dt>创建时间</dt><dd>{formatTime(artifact.createdAt)}</dd></div>
            </dl>
            <footer>
              <div className="artifact-card-actions" style={{ width: '100%', justifyContent: 'flex-end' }}>
                <button className="header-icon-button" type="button" title="在工作台编辑" onClick={() => onEdit({ runId: artifact.runId, artifactId: artifact.id })}>
                  <FilePenLine size={14} />
                </button>
                <button className="header-icon-button" type="button" title="预览" onClick={() => void open(artifact)}>
                  <Eye size={14} />
                </button>
                <button className="header-icon-button" type="button" title="复制 URI" onClick={() => void copyArtifactUri(artifact)}>
                  {copiedKey === artifactKey(artifact) ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button className="header-icon-button" type="button" title="下载" onClick={() => void downloadArtifact(artifact)}>
                  <Download size={14} />
                </button>
              </div>
            </footer>
          </article>
        )) : (
          <div className="empty-state">没有符合此状态的 Artifact 产物。</div>
        )}
      </div>

      {detail && (
        <DetailPanel title={`${detail.artifact.type} v${detail.artifact.version ?? 1}`} onClose={() => setDetail(null)}>
          <div className="artifact-detail-actions">
            <button className="ghost-btn" type="button" onClick={() => onEdit({ runId: detail.artifact.runId, artifactId: detail.artifact.id })}>
              <FilePenLine size={14} />在工作台编辑
            </button>
            <button className="header-icon-button" type="button" title="下载" onClick={() => void downloadArtifact(detail.artifact)}>
              <Download size={14} />
            </button>
          </div>
          <pre>{JSON.stringify(detail.payload, null, 2)}</pre>
        </DetailPanel>
      )}
    </section>
  )
}

function DetailPanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const [closing, setClosing] = useState(false)
  const panelRef = useRef<HTMLElement>(null)

  const close = useCallback(() => {
    setClosing(true)
    setTimeout(onClose, 180)
  }, [onClose])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  return createPortal(
    <div className="app-shell app-overlay-scope">
      <div className={`detail-overlay detail-overlay-drawer ${closing ? 'closing' : ''}`} onClick={close}>
        <aside ref={panelRef} className="detail-panel" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
          <header>
            <h2>{title}</h2>
            <button className="header-icon-button" type="button" title="关闭" onClick={close}>
              <X size={16} />
            </button>
          </header>
          {children}
        </aside>
      </div>
    </div>,
    document.body
  )
}
