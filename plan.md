我建议不要把 Runframe 直接改造成 Paperclip，也不要照搬 Lancer 的桌面工作区。更合理的方向是：以 Runframe 现有的任务编排能力为核心，吸收 Paperclip 的治理控制面，以及 Lancer 的执行工作区和过程可视化，重新划分领域边界。

这次重设计的重点不是简单增加几个模块，而是解决三个架构问题：

1. 谁负责决策和治理：目标、Agent、权限、预算、审批应该属于哪个层？
2. 谁负责计划和调度：工作流定义、动态任务拆解、依赖关系、并行执行如何协作？
3. 如何让执行过程可观察、可恢复、可验收：计划、实际执行、产物和交付状态不能混成一套数据。

我会把目标架构设计成一个分层、模块化的 AI 工作编排系统，并明确各层职责、核心领域对象、模块依赖和演进顺序。

# 一、重新定义 Runframe 的架构定位

我建议将 Runframe 定位为：

Local-first, Agent-agnostic AI Work Orchestration Platform

中文可以理解为：以任务交付为中心、支持多 Agent 协作的 AI 工作编排平台。

它不是单纯的 Agent 管理后台，也不是一个把多个终端放在一起的桌面客户端。它需要完成完整的工作闭环：

> 用户提出目标 → 系统制定计划 → 编排多个 Agent → 监控执行 → 人工介入 → 验证结果 → 交付成果。

三个项目的优势应该这样吸收：

| 项目        | 值得吸收的能力                                     | 不建议直接照搬的部分           |
| --------- | ------------------------------------------- | -------------------- |
| Runframe  | DAG 编排、任务执行、Artifact、Workflow               | 让 Run Manager 承担过多职责 |
| Paperclip | Goal、Agent Registry、治理、预算、审批、审计             | 过早建设完整 AI 公司组织系统     |
| Lancer    | Session、分支执行、Process Tree、桌面工作区、Diff Review | 把产品核心变成多 Session 管理器 |

Paperclip 的关键启发是把控制面和执行面分开：平台管理 Agent、任务、预算和治理，Agent 则通过 Adapter 在外部运行。

[image](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub+1



Lancer 的关键启发则是：计划中的任务依赖关系，不等于运行时实际发生的执行过程。 这两者应该分别建模、分别呈现。

# 二、目标架构：六层架构 + 横向治理

我建议从原来的偏功能模块式组织，升级为六层架构。

L6 · Product Experience

产品体验层

Mission Workspace · Dashboard · Graph · Timeline · Review · Settings

用户看到的工作空间、任务视图和交互入口

L5 · Application

应用用例层

Create Mission · Generate Plan · Start Run · Pause · Resume · Review · Deliver

负责组织业务流程，不直接承担底层执行细节

L4 · Domain

领域核心层

Mission & Project

目标与上下文

Planning

计划与任务图

Orchestration

调度与依赖

Agent

Agent 身份与能力

Execution

Session 与 Attempt

Delivery

产物与验收

L3 · Port & Adapter

能力接口与适配层

Agent Adapter · Model Provider · Git Provider · Storage · Tool Provider

把业务领域和具体 CLI、模型、Git、存储实现解耦

L2 · Infrastructure

基础设施层

Database · Event Store · File System · Process Manager · Scheduler · IPC/API

提供持久化、事件、进程和系统能力

&#x20;L1 · Runtime Environment&#x20;

运行环境层

Codex CLI · Claude Code · Pi · Shell · Remote Agent · Git Worktree

Agent 真正执行代码、调用工具、读写文件的地方

横向治理能力 · Governance Plane

Permission · Approval · Budget · Audit · Policy · Secret Access

横跨应用、领域、适配器和运行时；不能只作为一个 Settings 页面存在。

横向可观测能力 · Evidence Plane

Execution Events · Logs · Trace · Artifacts · Cost · Evaluation

记录实际发生的事情，为 UI、审计、恢复和验收提供统一事实来源。

这里有一个重要的架构决定：

Governance 和 Evidence 不应该只是普通业务模块，而应该是横跨各层的系统能力。

例如，Agent 启动之前要经过权限检查；执行过程中要记录工具调用、成本和状态；完成之后要形成可追溯的 Artifact 和验收记录。

这意味着权限控制不能仅仅通过前端隐藏按钮实现，而必须在真正执行动作的边界上生效。

# 三、核心领域模型：重新设计对象关系

这是我认为整个重构中最重要的部分。

我建议采用下面这套核心模型：

Project

长期项目、代码仓库、工作上下文

Goal

希望达成的长期或阶段性目标

Mission

一次具体工作请求，用户主要操作入口

Plan Revision

针对 Mission 生成并经过确认的计划版本

Task Graph / Workflow

任务节点、依赖关系、执行策略

Task Node

需要完成的工作单元

Agent Assignment

由谁负责执行

Run → Node Attempt → Agent Session

一次执行、某个任务的尝试，以及实际运行的 Agent 会话

Execution Events

实际执行事件和过程轨迹

Artifacts

代码、文档、报告、测试结果

Review → Delivery

验收、人工审批、最终交付

## 1. 必须区分的六个概念

| 概念            | 定义               | 解决的问题   |
| ------------- | ---------------- | ------- |
| Project       | 工作的长期容器          | 在哪里工作   |
| Goal          | 希望实现的结果          | 为什么做    |
| Mission       | 一次具体任务           | 这次要做什么  |
| Workflow      | 可复用的执行模板         | 通常怎么做   |
| Plan Revision | 某次 Mission 的具体计划 | 这次准备怎么做 |
| Run           | 一次实际执行实例         | 实际执行了什么 |

尤其要避免把 Mission、Workflow、Run 混为一个概念。

举个例子：

用户有一个 Project：`Runframe`

Goal：提升产品的任务执行可靠性。

用户创建 Mission：`增加 Agent 执行失败后的自动恢复机制`。

系统生成 Plan Revision：

- 分析现有错误处理机制
- 设计恢复策略
- 实现重试机制
- 增加恢复测试
- 生成交付报告

这些节点组成此次 Mission 的 Task Graph。

用户确认之后创建 Run，开始执行。

以后其他 Mission 也可以复用同一份 Workflow 模板，但每次都会有自己的 Plan Revision 和 Run。

Workflow 是模板，Plan 是实例化计划，Run 是执行实例。

## 2. 增加 Node Attempt，而不是只给 Node 一个状态

这是吸收 Lancer 执行模型后，我认为很有价值的一项改动。

一个 Node 可能执行多次：

```
Node: Implement Authentication

Attempt 1
  Agent: Codex
  Status: Failed
  Reason: Test failure

Attempt 2
  Agent: Claude Code
  Status: Failed
  Reason: Permission denied

Attempt 3
  Agent: Codex
  Status: Completed
```

因此，Node 不应该直接承载全部执行历史。

建议模型：

- `TaskNode`：任务定义。
- `NodeAttempt`：某次执行尝试。
- `AgentSession`：具体 Agent 运行会话。
- `ExecutionEvent`：运行过程中发生的事件。

这样才能支持重试、切换 Agent、恢复 Session 和执行审计。

## 3. 把计划图和执行过程图分开

这是 Runframe 应该建立的核心差异化能力。

Plan Graph

计划视图

[Fermata — AI Agent Orchestrator for macOS](https://images.openai.com/static-rsc-4/bVMRqd4jKrYc-4eGSr2EeFlniqybrKKN47YV5krLdVEx3iIa_GzNQhVTUrioRqpNuE_zpB-zsrHJRVzgbaZTzs3z8_AGLQuqjxSfOigIYuga_S4Hhsj__F-SQv_rvfRQBZKnhPBHLX78yUL0Wxszah-UK_TbRKMItLahcCaS49Y?purpose=inline)

系统原本打算如何完成任务：节点、依赖、并行关系、审批关卡。

Execution Trace

事实视图

[Hierarchical Multi-Agent Workflow: Visual Tree-Based Agent Orchestration in Codex App - Deprecations - OpenAI Developer Community](https://images.openai.com/static-rsc-4/aF6WIvWj31P2RqNZl5Gs6LfXrKJkCildyZCxyuUv-q5xB13KuxtYzC8mbHrxS72IPtYR9p6MyxY69r6xOEisOUQJ8Qwk_l6Vky9V8i4vyR1yImyxMHUUhnk-IH_oo1PMD5Mk4U1DYL1bx627ch46LwF5vQ0NXL5s_0LCLt_1SvI?purpose=inline)

实际发生了什么：Session、工具调用、分支、重试、失败和结果聚合。

例如，Plan Graph 只有一个 `Implement API` 节点。

但执行时可能发生：

- Codex 启动一个 Session。
- Session 创建子任务。
- 子任务调用测试工具。
- 测试失败后触发第二次 Attempt。
- 第二次 Attempt 切换到 Claude Code。
- 最后两个 Session 的产物被汇总。

这些属于 Execution Trace，不应该反过来污染原始计划定义。

# 四、重新划分核心业务模块

我建议把 Domain 层拆成八个边界明确的模块。

| 模块            | 核心职责                   | 主要对象                          |
| ------------- | ---------------------- | ----------------------------- |
| Workspace     | 项目、仓库、工作目录             | Project、Workspace             |
| Mission       | 目标、需求、上下文              | Goal、Mission                  |
| Planning      | 任务拆解、计划版本、DAG          | Plan、PlanRevision、TaskNode    |
| Orchestration | 调度、依赖、并行、重试            | Run、Scheduler、NodeAttempt     |
| Agent         | Agent 定义、能力和分配         | AgentProfile、Assignment       |
| Execution     | Session、Runtime、进程生命周期 | AgentSession、ExecutionContext |
| Governance    | 权限、审批、预算、审计            | Policy、Approval、Budget        |
| Delivery      | 产物、测试、Diff、验收          | Artifact、Review、Delivery      |

另外设立一个横向的 Evidence 能力，为这些模块提供持久化事件、日志、成本和执行证据。

## 各模块的边界需要严格控制

### Mission 模块

它只负责用户的工作意图和业务上下文，不负责实际执行。

例如：

```
interface Mission {
  id: string;
  projectId: string;
  goalId?: string;

  title: string;
  description: string;
  acceptanceCriteria: string[];

  status:
    | "draft"
    | "planning"
    | "ready"
    | "running"
    | "review"
    | "completed"
    | "cancelled";
}
```

### Planning 模块

负责将 Mission 转换成可执行的计划。

```
interface PlanRevision {
  id: string;
  missionId: string;
  revision: number;

  nodes: TaskNode[];
  edges: TaskDependency[];

  status: "draft" | "approved" | "superseded";
}
```

Plan Revision 必须版本化。

用户修改任务目标后，不应该静默覆盖已经批准的计划，而应该生成新的计划版本。

### Orchestration 模块

这是 Runframe 的核心引擎。

它不应该直接依赖 Codex CLI 或 Claude Code CLI。

它负责：

- 检查节点依赖。
- 决定哪些节点可以执行。
- 分配 Agent。
- 管理并行任务。
- 创建 Attempt。
- 处理失败和重试。
- 处理暂停、取消、恢复。
- 判断整体 Run 是否完成。

### Agent 模块

这里吸收 Paperclip 的 Agent Registry 设计。

但我建议区分 Agent 的三个层次：

| 对象            | 意义              |
| ------------- | --------------- |
| Agent Profile | Agent 的身份、角色和能力 |
| Agent Runtime | Agent 实际运行的环境   |
| Agent Session | 一次真实的执行会话       |

比如，一个 `Backend Engineer` Agent Profile 可以绑定 Codex Runtime，也可以在特定任务中使用 Claude Code Runtime。

不要让 Agent Profile 和具体 CLI 进程绑定。

### Governance 模块

把治理设计为真正的执行约束。

建议支持：

- Project 级权限。
- Mission 级执行策略。
- Agent 级工具访问限制。
- 危险操作审批。
- Token 和费用预算。
- 超预算自动暂停。
- 操作审计。

例如：

```
interface ExecutionPolicy {
  id: string;
  scope: "project" | "mission" | "agent";

  permissions: {
    fileWrite: boolean;
    shellExecution: boolean;
    networkAccess: boolean;
    gitCommit: boolean;
    gitPush: boolean;
  };

  approvalRequired: string[];
  budgetLimit?: number;
}
```

这只是概念接口，后续还需要把权限细化为具体工具、路径、命令和资源范围。

# 五、技术架构：采用 Modular Monolith，不要急着做微服务

我不建议现阶段拆成多个独立服务。

Runframe 当前更适合：

Electron + Next.js/React + TypeScript + Modular Monolith + Adapter Architecture

原因是当前产品的主要复杂度在领域模型、任务状态、执行生命周期和跨模块协调，而不是大规模分布式部署。

先把模块边界设计正确，未来有需要再拆服务。

## 1. 推荐的代码目录

我建议逐步把现在的 `src/core`、执行管理、Agent 编排和 API Route 等代码整理成下面的结构。

```
src/
├── app/                         # 应用入口
│   ├── desktop/
│   ├── web/
│   └── api/
│
├── presentation/                # UI 表现层
│   ├── shell/
│   ├── dashboard/
│   ├── mission-workspace/
│   ├── workflow-editor/
│   ├── execution-monitor/
│   ├── delivery-review/
│   └── settings/
│
├── application/                 # 应用用例层
│   ├── missions/
│   │   ├── create-mission.ts
│   │   ├── generate-plan.ts
│   │   └── approve-plan.ts
│   ├── runs/
│   │   ├── start-run.ts
│   │   ├── pause-run.ts
│   │   ├── resume-run.ts
│   │   └── cancel-run.ts
│   ├── reviews/
│   └── deliveries/
│
├── domain/                      # 领域核心
│   ├── workspace/
│   ├── mission/
│   ├── planning/
│   ├── workflow/
│   ├── orchestration/
│   ├── agent/
│   ├── execution/
│   ├── governance/
│   ├── evidence/
│   └── delivery/
│
├── ports/                       # 抽象接口
│   ├── agent-runtime.ts
│   ├── process-manager.ts
│   ├── event-store.ts
│   ├── artifact-store.ts
│   ├── workspace-provider.ts
│   ├── git-provider.ts
│   └── model-provider.ts
│
├── adapters/                    # 外部能力实现
│   ├── agents/
│   │   ├── codex/
│   │   ├── claude-code/
│   │   ├── pi/
│   │   └── shell/
│   ├── git/
│   ├── storage/
│   └── models/
│
├── infrastructure/              # 基础设施实现
│   ├── database/
│   ├── event-bus/
│   ├── scheduler/
│   ├── process/
│   ├── filesystem/
│   ├── ipc/
│   └── recovery/
│
└── shared/                      # 纯共享代码
    ├── types/
    ├── errors/
    ├── utils/
    └── constants/
```

这是一种目标结构，不建议一次性移动所有文件。需要先确立依赖边界，再逐模块迁移。

## 2. 模块之间应该如何依赖？

核心原则是：

- Presentation 依赖 Application，不直接调用 Agent CLI。
- Application 编排 Domain，不实现底层进程管理。
- Domain 定义业务规则和 Port，不依赖具体外部工具。
- Adapter 实现 Port，负责连接具体运行时。
- Infrastructure 实现持久化、调度、事件和 IPC。
- Governance 在执行入口强制检查权限。

例如：

```
Mission UI
    │
    ▼
StartRun Use Case
    │
    ├── Planning Domain
    │
    ├── Orchestration Domain
    │
    ├── Governance Domain
    │
    ▼
AgentRuntime Port
    │
    ▼
Codex Adapter
    │
    ▼
Codex CLI
```

这里最重要的变化是：`Orchestration` 只知道 `AgentRuntime` 接口，不知道 Codex CLI 的具体实现。

以后添加 Claude Code、Pi、远程 Agent 或其他运行时，不需要改写编排引擎。

## 3. Agent Adapter 接口建议

这是我建议优先稳定下来的一个接口。

```
interface AgentRuntime {
  id: string;

  capabilities(): Promise<AgentCapabilities>;

  start(
    context: ExecutionContext
  ): Promise<AgentSessionHandle>;

  sendMessage(
    sessionId: string,
    message: string
  ): Promise<void>;

  observe(
    sessionId: string
  ): AsyncIterable<ExecutionEvent>;

  pause(
    sessionId: string
  ): Promise<void>;

  resume(
    sessionId: string
  ): Promise<void>;

  cancel(
    sessionId: string
  ): Promise<void>;

  getStatus(
    sessionId: string
  ): Promise<SessionStatus>;
}
```

需要注意：并不是所有 Agent Runtime 都原生支持暂停和恢复。因此接口要允许能力声明，例如：

```
interface AgentCapabilities {
  streaming: boolean;
  resumeSession: boolean;
  pauseSession: boolean;
  structuredEvents: boolean;
  usageReporting: boolean;
  toolCallReporting: boolean;
}
```

对于不支持的能力，由 Adapter 返回明确的 `unsupported` 结果，不能假装所有 Agent 的生命周期语义都一样。

# 六、执行引擎：把 Run Manager 升级为 Orchestration Engine

这是现有 Runframe 架构中我最建议重点重构的地方。

我不建议继续让一个 `run-manager.ts` 同时负责：

- 创建 Run。
- 计算 DAG。
- 启动 Agent。
- 管理进程。
- 收集日志。
- 处理重试。
- 持久化状态。
- 管理 Artifact。
- 发送 SSE。
- 恢复中断任务。

这些职责应该拆分。

## 1. 新的执行架构

```
                 Orchestration Engine
                          │
              ┌───────────┴───────────┐
              │                       │
         Run Scheduler          Dependency Resolver
              │                       │
              └───────────┬───────────┘
                          │
                    Task Dispatcher
                          │
                    Agent Assignment
                          │
                    Policy Check
                          │
                    Execution Manager
                          │
                    Agent Adapter
                          │
                    Agent Runtime
                          │
                    Event Collector
                          │
              ┌───────────┴───────────┐
              │                       │
          Event Store            Artifact Store
              │                       │
              └───────────┬───────────┘
                          │
                    State Projector
                          │
                   Mission Workspace
```

建议将职责明确为：

| 组件                  | 职责                        |
| ------------------- | ------------------------- |
| Run Scheduler       | 决定何时调度                    |
| Dependency Resolver | 判断节点依赖是否满足                |
| Task Dispatcher     | 将可执行节点交给执行系统              |
| Agent Assignment    | 选择合适 Agent                |
| Policy Check        | 判断是否允许执行                  |
| Execution Manager   | 管理 Attempt 和 Session 生命周期 |
| Event Collector     | 收集运行时事件                   |
| State Projector     | 根据事件更新当前状态                |
| Recovery Manager    | 从持久化状态恢复中断任务              |

## 2. 采用事件驱动，但不要一开始就做复杂 Event Sourcing

我建议采用：

Durable Event Log + Current State Projection

每次重要状态变化都生成事件：

```
type ExecutionEvent =
  | { type: "run.started" }
  | { type: "node.ready"; nodeId: string }
  | { type: "node.started"; nodeId: string }
  | { type: "attempt.started"; attemptId: string }
  | { type: "agent.session.started"; sessionId: string }
  | { type: "agent.tool.called"; toolName: string }
  | { type: "approval.required"; approvalId: string }
  | { type: "node.failed"; nodeId: string }
  | { type: "node.completed"; nodeId: string }
  | { type: "artifact.created"; artifactId: string }
  | { type: "run.completed" };
```

注意，这只是示意类型，实际需要统一事件 Envelope：

```
interface EventEnvelope<T> {
  id: string;
  aggregateId: string;
  runId: string;
  sequence: number;

  type: string;
  occurredAt: string;
  payload: T;
  schemaVersion: number;
}
```

系统同时维护两种数据：

- Events：实际发生过什么，不应该被静默覆盖。
- Current State：为了快速查询而维护的当前状态，可以根据事件重建。

这样就能支持：

- 关闭应用后恢复任务状态。
- 查看某个 Node 的完整历史。
- 查看 Agent 的执行时间线。
- 追踪失败原因和重试过程。
- 重建 Process Tree。
- 统计成本和执行效率。

但不需要把每个鼠标操作、每次 UI 状态变化都事件化。只记录有业务价值的状态变化和执行事实即可。

## 3. 持久化方案

我建议采用分层存储，而不是所有东西都写进一个 JSON Manifest。

| 数据类型                   | 推荐存储         |
| ---------------------- | ------------ |
| Mission、Project、Agent  | SQLite       |
| Plan Revision、Workflow | SQLite       |
| Run、Node、Attempt       | SQLite       |
| Execution Events       | SQLite       |
| Artifact 文件内容          | 文件系统         |
| Artifact 元数据           | SQLite       |
| Agent Session 原始输出     | 文件系统或可配置日志存储 |
| UI 布局、面板状态             | 本地配置文件       |

初期可以继续保持 Local-first：

- SQLite 作为结构化业务数据的可靠存储。
- 文件系统作为 Artifact 和大型执行日志存储。
- 事件记录和业务状态放在同一数据库事务边界内。
- 后续需要多用户或远程部署时，再引入 PostgreSQL 和远程存储。

尤其要注意：执行事件落库和状态更新需要有可靠的一致性机制。不能出现 UI 显示任务已经启动，但对应事件和 Session 记录并没有成功持久化的情况。

# 七、产品体验也应该围绕新架构重做

架构重构最终应该反映在用户体验上，而不只是代码目录变化。

我建议采用四个主要工作区。

1\. Mission Workspace

核心入口

[光谱AI v0.9.10 — 多 AI 协同的指挥中心](https://images.openai.com/static-rsc-4/PC26ahWQLTStA6QYYU8cMIyHCTsrRY1Ga4SF-JlXxjkCmfOWFospjbmSLy5YmY7Kdh-T7gybFJGxXfjaF-roPrHtOWsS5WS4axEBlL6V6XjEsAcDfKiqMo1tCQPBkyoYgKFYcTaJTGgNA0iH_gGWgJn6WZQ8wT5bm_dpFypjSIw?purpose=inline)

[spectraidev.com](https://www.spectraidev.com/?utm_source=chatgpt.com)

用户提出目标、查看计划、修改上下文、设置验收标准、启动任务。

2\. Workflow & Planning

[Flow-Like | Open Source Workflow Engine - Local-First, Rust-Powered, Type-Safe](https://images.openai.com/static-rsc-4/hfLIT1RXXq9kurohlgwyX96B3glAbqNhLxiGjbDFirvCqB1lZUoAebE7fR6uN6VSbs51Rx7b-ewFIWeLrW-_YgIYAiNnYRghJTJBdTLEqZ1ydg5KwlUJEb3F0ZJbCiD07eXrSoaLIVO6xfvFPryH4sXQNQC_6eaX13FxUtgzJ3s?purpose=inline)

[flow-like.com](https://flow-like.com/?utm_source=chatgpt.com)

设计可复用 Workflow，查看 Mission 的 Plan Graph，调整节点依赖和执行策略。

3\. Execution Workspace

[Hierarchical Multi-Agent Workflow: Visual Tree-Based Agent Orchestration in Codex App - Deprecations - OpenAI Developer Community](https://images.openai.com/static-rsc-4/NKu8UsgMJPKMnquqWmu6ySrRButkVftvhdndH5Yz-i-UtBdfvjTPOzoUnZDEitLvZg3-8ziJKB_Oalq5PCT0z0T7hfPaBfLyMvqu6CdXMdsINcV3h2kKQCahN6VdQRd4atmbQhXmUlxoMZjpQmhaxUPnp8B2hccmSHgWJNNPIT0?purpose=inline)

[community.openai.com](https://community.openai.com/t/hierarchical-multi-agent-workflow-visual-tree-based-agent-orchestration-in-codex-app/1401395?utm_source=chatgpt.com)

查看 Agent Session、Process Tree、实时日志、Diff、运行状态和工具调用。

4\. Delivery & Review

[Gallery | Built with Opus 4.7: a Claude Code hackathon](https://images.openai.com/static-rsc-4/3pUEtMwzUPQ2nh1dV0o4C_GojQcXdxDDYWsPKZPA4iZQEdfuPJSQI-0qh_zN3LAXE5Fti_GL3O52Ev9gng1bVHlwHGs6A7v4skKdwlBWxJNW7UYSlhST0CchEwhJ_-tX3r8Y15g3uJgnXNAQcbWazcAckywBT-xRdn95Hv_opS4?purpose=inline)

[cerebralvalley.ai](https://cerebralvalley.ai/e/built-with-4-7-hackathon/hackathon/gallery?utm_source=chatgpt.com)

统一查看代码变更、测试结果、文件产物、审批请求和最终交付。

这里建议一个非常重要的产品设计原则：

不要让用户为了理解同一个 Mission，在四个互不相关的页面之间来回切换。

它们应该是同一个 Mission 上下文中的不同工作视图。

例如：

```
Mission: Add authentication

Overview
Plan
Execution
Review
Delivery
```

用户进入 Mission 后，始终可以知道：

- 当前目标是什么。
- 计划有哪些节点。
- 哪些 Agent 正在工作。
- 哪个节点遇到问题。
- 是否需要人工审批。
- 最终产物在哪里。

Agent Registry、Budget、Permission、Workflow Template 等则放到配置和管理区域，不应该成为每次执行任务都必须经过的入口。

# 八、建议的重构优先级

不要一次性实现全部架构。我建议分成四个阶段。

1. Phase 1：重建领域模型和执行核心

   最高优先级

   目标：让 Runframe 有可靠的任务执行闭环。
   - 明确 Project、Goal、Mission、Workflow、Plan Revision、Run 的关系。
   - 将 Node 拆分为 TaskNode 和 NodeAttempt。
   - 建立 AgentRuntime Adapter 接口。
   - 将 Run Manager 拆分成 Scheduler、Dispatcher、Execution Manager。
   - 建立持久化 Execution Event。
   - 实现应用重启后的任务状态恢复。
   验收标准： 一个 Mission 能生成计划，执行多个节点，失败后重试，关闭应用再打开仍能看到正确状态。
2. Phase 2：建设执行工作区

   第二优先级
   - 建立 Plan Graph。
   - 建立 Execution Timeline。
   - 建立 Process Tree。
   - 管理多个 Agent Session。
   - 支持 Git Worktree 隔离。
   - 增加 Diff、日志和 Artifact Review。
   验收标准： 用户能区分系统原计划与实际执行过程，并能定位某个结果由哪个 Agent、哪个 Attempt 产生。
3. Phase 3：建设治理控制面
   - Agent Registry。
   - Agent Role 和 Capability。
   - Permission Policy。
   - Approval Workflow。
   - Budget Tracking。
   - Audit Log。
   验收标准： 用户能控制 Agent 能做什么、哪些动作需要批准、成本超过限制后如何处理。
4. Phase 4：建设智能化和平台化能力
   - 动态任务拆解。
   - Agent 自动选择和任务分配。
   - 多 Agent 协作和结果聚合。
   - Workflow Template 市场或共享机制。
   - Skill Registry。
   - Agent Evaluation。
   - 远程 Agent Runtime。
   验收标准： 系统不仅能按固定 DAG 执行，还能根据任务情况动态规划、调整和优化执行策略。

# 九、现有架构中哪些应该保留、拆分和升级？

根据之前对 Runframe 的代码结构检查，我建议这样处理：

| 现有部分                | 建议    | 目标                                     |
| ------------------- | ----- | -------------------------------------- |
| `src/core/index.ts` | 拆分    | 按领域模块导出，避免成为全局依赖入口                     |
| `run-manager.ts`    | 重点拆分  | Orchestration Engine                   |
| Agent Orchestrator  | 升级    | Task Dispatcher + Agent Assignment     |
| Permission Policy   | 保留并升级 | Governance Domain                      |
| Artifact Schema     | 保留并升级 | Delivery / Artifact Domain             |
| Workflow Config     | 拆分    | Workflow Definition + Plan Revision    |
| SSE Event Route     | 改造    | 基于持久化 Execution Event 推送               |
| Mission Hub UI      | 保留并重构 | Mission Workspace                      |
| Executor Settings   | 升级    | Agent Registry + Runtime Configuration |
| JSON Manifest       | 逐步迁移  | SQLite + 文件系统                          |

有三个地方我尤其不建议简单重写：

1. 现有 DAG 能力：它是 Runframe 的核心资产，应该升级成 Plan Graph，而不是推倒重来。
2. Artifact 体系：它应该成为最终交付和审查的基础，不只是运行结果的附件。
3. 权限策略：应当从已有的 Permission Policy 演进成统一治理机制，而不是另外建一套互不兼容的权限系统。

# 十、我认为需要坚持的五条架构原则

这五条应该成为后续代码评审和架构决策的约束。

| 原则                 | 具体要求                                    |
| ------------------ | --------------------------------------- |
| Domain First       | 先定义领域对象和边界，再设计 UI 和 API                 |
| Agent Agnostic     | 编排核心不依赖特定 Agent、模型或 CLI                 |
| Plan ≠ Execution   | 计划图与实际执行轨迹分别建模                          |
| Durable by Default | Run、Attempt、Event 和 Artifact 必须可持久化、可恢复 |
| Governed Execution | 权限、审批、预算在执行边界强制执行                       |

另外，我建议加上一条长期原则：每一个最终交付物都必须能追溯到 Mission、Plan Revision、TaskNode、Attempt 和 Agent Session。

这是系统建立可信度的基础。

# 十一、最终建议：Runframe 的核心竞争力应该是什么？

我不建议把目标定为“管理更多 Agent”。

Paperclip 已经在 Agent 组织管理、目标、预算和治理方面建立了相当完整的产品方向；其控制面与执行适配器的分离值得借鉴。

[image](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub+1



Lancer 则提供了执行过程和开发工作区的设计参考。

Runframe 应该把两者结合在一个更聚焦的能力上：

# Runframe

# From Intent to Verified Delivery

从任务意图到可验证交付的 AI 工作编排系统。

Understand

理解目标和上下文

Plan

生成可执行计划

Orchestrate

协调多个 Agent

Observe

追踪真实执行过程

Govern

权限和人工控制

Deliver

验证并交付结果

我的最终取舍是：

- 以 Runframe 的 DAG 和任务编排为核心。
- 用 Paperclip 的 Agent Registry、Goal、Governance 强化系统控制能力。
- 用 Lancer 的 Session、Process Tree、Git Worktree、Diff Review 强化执行工作区。
- 用 Durable Event Log 和 Artifact Trace 把所有能力串起来。

第一阶段不要急着做 Agent 组织树、复杂预算中心、动态 Agent 自我组织，也不要先追求微服务化。

先把一件事做到可靠：

用户给出一个复杂的软件开发目标，Runframe 能自主拆解、协调多个 Agent、管理执行过程、处理中断和失败，最后给出可以检查、验证和接受的交付成果。

这才是整套架构应该围绕的核心。

## 下一步：把这份架构变成真正可实施的技术设计

我建议下一步直接做一份 Runframe Architecture V2 技术设计文档，先落实三个最关键的设计产物：

1. Domain Model RFC：每个核心实体的字段、生命周期、关系和状态机。
2. Module Boundary RFC：各模块的接口、依赖规则、事件协议和目录结构。
3. Execution Engine RFC：Run Scheduler、Dispatcher、Agent Adapter、Event Store、Recovery Manager 的详细设计。

这样我们就能从架构方向进入具体代码重构，而不是停留在概念图阶段。