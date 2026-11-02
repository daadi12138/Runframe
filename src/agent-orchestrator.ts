import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildRepositoryMap } from './intelligent-orchestration'
import { loadProject } from './project'
import { listRuns, startRun, type RunSnapshot } from './run-manager'

export type AgentRole = 'router' | 'architect' | 'coder' | 'validator' | 'reviewer' | 'security'

export type TicketStage = 'backlog' | 'planning' | 'in_progress' | 'gate' | 'validating' | 'completed' | 'blocked'

export type ExecutionMode = 'autonomous' | 'observe' | 'gate_required'

export type OrchestratedTicket = {
  id: string
  title: string
  description: string
  stage: TicketStage
  workerRole: AgentRole
  executorId: string
  branch: string
  dependencies: string[]
  acceptanceCriteria: string[]
  executionMode: 'read_only' | 'workspace_write'
  activeToolCall?: { tool: string; argument?: string; startedAt: string }
  deliverables?: Array<{ id: string; name: string; type: string; summary?: string }>
  progress?: number
  errorMessage?: string
  nodeId?: string
  runId?: string
  createdAt: string
  updatedAt: string
}

export type SuperagentMission = {
  id: string
  goal: string
  mode: ExecutionMode
  runId?: string
  status: 'planning' | 'executing' | 'completed' | 'paused' | 'failed'
  tickets: OrchestratedTicket[]
  repoSummary?: { fileCount: number; keyFiles: string[] }
  createdAt: string
  updatedAt: string
}

const missionsStore = new Map<string, SuperagentMission>()

function getStoragePath(): string {
  const baseDir = process.env.ARTIFACT_STATE_DIR || join(process.cwd(), '.artifact-state')
  return join(baseDir, 'superagent-missions.json')
}

export async function loadMissions(): Promise<SuperagentMission[]> {
  try {
    const file = getStoragePath()
    const content = await readFile(file, 'utf8')
    const list = JSON.parse(content) as SuperagentMission[]
    for (const mission of list) {
      missionsStore.set(mission.id, mission)
    }
    return list
  } catch {
    return Array.from(missionsStore.values())
  }
}

export async function saveMissions(): Promise<void> {
  try {
    const file = getStoragePath()
    await mkdir(join(file, '..'), { recursive: true })
    const list = Array.from(missionsStore.values())
    await writeFile(file, JSON.stringify(list, null, 2), 'utf8')
  } catch {
    // In-memory fallback
  }
}

export async function getActiveMission(): Promise<SuperagentMission | null> {
  const list = await loadMissions()
  if (list.length > 0) {
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  }
  return null
}

/**
 * Superagent / Router Agent proactive decomposition (inspired by deepseek-ai/dsh-superagent-prototype)
 * Takes a high-level goal, scans the repo context, and autonomously breaks down the mission into dynamic tickets.
 */
export async function decomposeGoal(
  goal: string,
  mode: ExecutionMode = 'autonomous',
  options?: { projectPath?: string }
): Promise<SuperagentMission> {
  const project = await loadProject()
  const repoPath = options?.projectPath || project?.repositoryPath || process.cwd()

  let repoSummary: { fileCount: number; keyFiles: string[] } | undefined
  try {
    const repoMap = await buildRepositoryMap(repoPath, goal)
    repoSummary = {
      fileCount: repoMap.fileCount,
      keyFiles: repoMap.files.slice(0, 8).map(f => f.path),
    }
  } catch {
    repoSummary = { fileCount: 0, keyFiles: [] }
  }

  const cleanGoal = goal.trim() || '分析并优化当前项目'
  const isBugfix = /bug|fix|修复|报错|错误|崩溃|异常/.test(cleanGoal.toLowerCase())
  const isUi = /ui|界面|样式|交互|前端|看板|页面/.test(cleanGoal.toLowerCase())
  const isRefactor = /重构|优化|依赖|拆分|规范|升级/.test(cleanGoal.toLowerCase())

  const missionId = `mission-${randomUUID().slice(0, 8)}`
  const now = new Date().toISOString()
  const branchName = `agent/${isBugfix ? 'fix' : isUi ? 'ui' : isRefactor ? 'refactor' : 'feat'}-${randomUUID().slice(0, 6)}`

  // Dynamic ticket generation by the Router agent
  const tickets: OrchestratedTicket[] = [
    {
      id: `ticket-${randomUUID().slice(0, 6)}`,
      title: '上下文与架构分析',
      description: `Router Agent 深入解析目标需求「${cleanGoal}」，定位代码库中的关联模块与依赖影响面。`,
      stage: 'planning',
      workerRole: 'router',
      executorId: 'codex',
      branch: branchName,
      dependencies: [],
      acceptanceCriteria: ['输出需求规格说明书与受影响文件列表', '确定修改边界与风险项'],
      executionMode: 'read_only',
      progress: mode === 'observe' ? 80 : 40,
      activeToolCall: { tool: 'build_repo_map', argument: cleanGoal, startedAt: now },
      deliverables: [{ id: 'spec-1', name: '需求与影响面评估报告', type: 'ui-spec', summary: '已提取受影响文件与测试范围' }],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `ticket-${randomUUID().slice(0, 6)}`,
      title: isBugfix ? '根本原因定位与修复方案' : isUi ? '组件架构与视觉原型方案' : '接口定义与核心实现方案',
      description: 'Architect Agent 制定细化实施方案，包含关键数据结构、状态设计与向下兼容策略。',
      stage: mode === 'observe' ? 'planning' : 'in_progress',
      workerRole: 'architect',
      executorId: 'codex',
      branch: branchName,
      dependencies: ['ticket-1'],
      acceptanceCriteria: ['模块输入输出接口明确', '无破坏性非受控变更'],
      executionMode: 'read_only',
      progress: 25,
      activeToolCall: { tool: 'analyze_architecture', argument: repoSummary.keyFiles.join(', '), startedAt: now },
      deliverables: [{ id: 'spec-2', name: '架构规格方案', type: 'approved-spec' }],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `ticket-${randomUUID().slice(0, 6)}`,
      title: '执行方案与安全准入审批',
      description: '审批关卡：确认 Agent 规划的改动边界、Worktree 分支及命令授权清单。',
      stage: mode === 'observe' || mode === 'gate_required' ? 'gate' : 'backlog',
      workerRole: 'security',
      executorId: 'system',
      branch: branchName,
      dependencies: ['ticket-2'],
      acceptanceCriteria: ['确认允许写入 Worktree', '确认测试命令执行清单'],
      executionMode: 'read_only',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `ticket-${randomUUID().slice(0, 6)}`,
      title: isBugfix ? '代码缺陷修复与异常处理' : isUi ? 'UI 组件实现与主题适配' : '核心功能编码与逻辑集成',
      description: `Coding Agent 在隔离分支 ${branchName} 中编写代码，严格遵循项目规范与防 AI Slop 纪律。`,
      stage: 'backlog',
      workerRole: 'coder',
      executorId: 'codex',
      branch: branchName,
      dependencies: ['ticket-3'],
      acceptanceCriteria: ['代码改动聚焦且无冗余修改', '符合现有代码风格与 TypeScript 严格模式'],
      executionMode: 'workspace_write',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `ticket-${randomUUID().slice(0, 6)}`,
      title: '自动化验证与回归测试',
      description: 'Validator Agent 在 Worktree 环境中自动执行类型检查、单元测试及 Lint 校验。',
      stage: 'backlog',
      workerRole: 'validator',
      executorId: 'codex',
      branch: branchName,
      dependencies: ['ticket-4'],
      acceptanceCriteria: ['TypeScript 类型检查通过', '核心测试用例 100% 通过'],
      executionMode: 'read_only',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `ticket-${randomUUID().slice(0, 6)}`,
      title: '代码审查与最终交付',
      description: 'Reviewer Agent 生成 Git Diff 报告，汇总交付变更，等待合并到主项目。',
      stage: 'backlog',
      workerRole: 'reviewer',
      executorId: 'codex',
      branch: branchName,
      dependencies: ['ticket-5'],
      acceptanceCriteria: ['Git Diff 无冲突', '产出最终交付总结与变更日志'],
      executionMode: 'read_only',
      createdAt: now,
      updatedAt: now,
    },
  ]

  const mission: SuperagentMission = {
    id: missionId,
    goal: cleanGoal,
    mode,
    status: 'executing',
    tickets,
    repoSummary,
    createdAt: now,
    updatedAt: now,
  }

  missionsStore.set(missionId, mission)
  await saveMissions()
  return mission
}

/**
 * Dispatches an orchestrated mission into a real Artifact Run for live background execution.
 */
export async function dispatchMissionToRun(missionId: string): Promise<{ mission: SuperagentMission; run: RunSnapshot }> {
  await loadMissions()
  const mission = missionsStore.get(missionId)
  if (!mission) throw new Error(`Mission not found: ${missionId}`)

  // Map tickets to Run nodes
  const nodes = mission.tickets.map(ticket => ({
    id: ticket.id,
    kind: ticket.workerRole === 'coder' ? 'Agent' : ticket.workerRole === 'security' ? '审批' : ticket.workerRole === 'validator' ? '验证' : 'Agent',
    executorId: ticket.executorId === 'system' ? undefined : ticket.executorId,
    executionMode: ticket.executionMode,
    prompt: ticket.description,
    outputType: ticket.workerRole === 'validator' ? 'test-report' : ticket.workerRole === 'reviewer' ? 'git-diff' : 'agent-report',
  }))

  const edges: Array<{ from: string; to: string }> = []
  for (let i = 0; i < mission.tickets.length - 1; i++) {
    edges.push({ from: mission.tickets[i].id, to: mission.tickets[i + 1].id })
  }

  const run = await startRun({
    nodes,
    edges,
    input: { text: mission.goal, attachments: [] },
    intentAware: true,
  })

  mission.runId = run.id
  mission.status = 'executing'
  mission.updatedAt = new Date().toISOString()
  missionsStore.set(missionId, mission)
  await saveMissions()

  return { mission, run }
}

/**
 * Superagent dynamic re-planning (when test fails or new sub-issue is discovered)
 */
export async function replanMissionTickets(missionId: string, currentTicketId: string, reason?: string): Promise<SuperagentMission> {
  await loadMissions()
  const mission = missionsStore.get(missionId)
  if (!mission) throw new Error(`Mission not found: ${missionId}`)

  const currentIdx = mission.tickets.findIndex(t => t.id === currentTicketId)
  const now = new Date().toISOString()

  // Dynamically insert a repair or branching ticket
  const repairTicket: OrchestratedTicket = {
    id: `ticket-repair-${randomUUID().slice(0, 6)}`,
    title: `[自愈] ${reason || '修复前序步骤发现的异常问题'}`,
    description: `Superagent 观测到执行阻塞，自动编排补充修复分支，针对报错进行专门修补与验证。`,
    stage: 'in_progress',
    workerRole: 'coder',
    executorId: 'codex',
    branch: mission.tickets[currentIdx]?.branch || 'agent/repair-patch',
    dependencies: [currentTicketId],
    acceptanceCriteria: ['消除阻塞错误', '恢复工作流执行路径'],
    executionMode: 'workspace_write',
    activeToolCall: { tool: 'self_heal_patch', argument: reason || 'fix blocked state', startedAt: now },
    createdAt: now,
    updatedAt: now,
  }

  if (currentIdx >= 0) {
    mission.tickets.splice(currentIdx + 1, 0, repairTicket)
  } else {
    mission.tickets.push(repairTicket)
  }

  mission.updatedAt = now
  missionsStore.set(missionId, mission)
  await saveMissions()
  return mission
}

/**
 * Convert runs to tickets if no explicit mission exists, ensuring Kanban always shows live data.
 */
export async function getKanbanTicketsFromRuns(): Promise<OrchestratedTicket[]> {
  const runs = await listRuns()
  if (!runs.length) return []

  const activeRun = runs.find(r => ['running', 'preparing', 'awaiting_approval'].includes(r.status)) || runs[0]
  if (!activeRun) return []

  const stageMap = (state: string): TicketStage => {
    switch (state) {
      case 'running': return 'in_progress'
      case 'waiting': return 'gate'
      case 'success': return 'completed'
      case 'failed': return 'blocked'
      case 'paused': return 'gate'
      default: return 'backlog'
    }
  }

  const roleMap = (kind: string, id: string): AgentRole => {
    if (kind === '审批' || id.includes('approval') || id.includes('gate')) return 'security'
    if (kind === '验证' || id.includes('test') || id.includes('val')) return 'validator'
    if (kind === '交付' || id.includes('review') || id.includes('diff')) return 'reviewer'
    if (kind === '输入' || id.includes('req') || id.includes('route')) return 'router'
    if (id.includes('spec') || id.includes('plan')) return 'architect'
    return 'coder'
  }

  return activeRun.nodes.map((node, index) => {
    const attempt = node.attempts?.at(-1)
    const trace = attempt?.trace?.at(-1)

    return {
      id: node.id,
      title: node.id,
      description: node.prompt || `执行 ${node.kind} 阶段任务`,
      stage: stageMap(node.state),
      workerRole: roleMap(node.kind, node.id),
      executorId: node.executorId || 'codex',
      branch: activeRun.branchName || 'main',
      dependencies: index > 0 ? [activeRun.nodes[index - 1].id] : [],
      acceptanceCriteria: ['按时完成既定交付物', '通过相应测试验证'],
      executionMode: node.executionMode || 'read_only',
      nodeId: node.id,
      runId: activeRun.id,
      activeToolCall: trace ? { tool: trace.toolName || trace.kind, argument: trace.command || trace.content?.slice(0, 80), startedAt: trace.occurredAt } : undefined,
      deliverables: activeRun.artifacts.filter(a => a.nodeId === node.id).map(a => ({ id: a.id, name: a.type, type: a.type, summary: `v${a.version} · ${a.status}` })),
      progress: node.state === 'success' ? 100 : node.state === 'running' ? 50 : 0,
      createdAt: activeRun.startedAt,
      updatedAt: attempt?.endedAt || activeRun.startedAt,
    }
  })
}
