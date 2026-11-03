# Runframe Architecture V2

**Status:** Incremental architecture RFC  
**Target branch:** `architecture-v2`  
**Compatibility rule:** V2 is additive. Existing Run manifests, Workflow definitions, CLI integrations, and local state remain authoritative until an explicit migration is implemented.

## 1. Product and architectural decision

Runframe is a local-first AI work orchestration workspace. It connects a user's mission and acceptance criteria to a dependency-aware plan, one or more agent executions, reviewable evidence, and an explicit delivery decision.

The product model combines three complementary perspectives:

- **Governance (Paperclip-inspired):** goals, agent profiles, assignment, policy, approvals, and budget visibility.
- **Orchestration (Runframe core):** mission planning, dependency resolution, scheduling, retries, cancellation, and recovery.
- **Execution workbench (Lancer-inspired):** agent sessions, process trees, event timelines, diffs, artifacts, and delivery review.

Do not copy the operational weight of a multi-tenant control plane into the local-first application. Keep the application a modular monolith with explicit ports and adapters.

## 2. Core domain vocabulary

| Concept | Meaning |
| --- | --- |
| Goal | Durable outcome the user wants to achieve |
| Mission | User-facing unit of work with scope and acceptance criteria |
| Workflow | Reusable process template |
| PlanRevision | Immutable snapshot of the proposed task graph |
| TaskNode | A planned unit of work |
| Run | One execution of a mission/workflow |
| NodeAttempt | A concrete attempt to execute a task |
| AgentProfile | Runtime-neutral description of an agent |
| AgentSession | Runtime session attached to an attempt |
| ExecutionEvent | Append-only fact emitted during execution |
| Artifact | Validated output or evidence |
| Approval | Scoped human authorization |
| Delivery | Reviewed and explicitly accepted output |

A Mission is not a Run. A Plan is not an execution trace. An AgentSession is not a TaskNode. Preserve these distinctions in APIs and persistence.

## 3. Logical architecture

1. **Product experience:** Mission workspace, plan graph, execution timeline/process tree, review and delivery.
2. **Application use cases:** create mission, validate plan, start run, dispatch task, approve action, recover run, assemble delivery.
3. **Domain:** mission, workflow, plan graph, run/attempt state machines, policy decisions, artifact and delivery contracts.
4. **Ports:** agent runtime, event store, mission repository, approval service, clock, ID generator.
5. **Adapters:** Codex CLI, Claude Code CLI, filesystem JSON persistence, Git Worktree, process execution, UI event transport.
6. **Runtime environment:** local machine, project repository, isolated Worktree, subprocesses.

Cross-cutting planes:
- **Governance plane:** permissions, immutable approval scope, budget limits, audit decisions.
- **Evidence plane:** events, logs, diffs, test results, artifacts, provenance.

Dependency direction is inward: UI and adapters depend on application/domain contracts; domain code must not import Next.js, Electron, filesystem, or a concrete agent CLI.

## 4. Plan graph vs execution trace

The Plan Graph describes intended work: nodes, dependencies, assignments, and acceptance criteria. The Execution Trace describes what actually happened: attempts, sessions, subprocesses, timestamps, tool activity, and outcomes.

Never mutate a plan node to represent a subprocess. Record runtime activity as events and project it into a process tree. A retry creates a new NodeAttempt; it does not erase the prior attempt.

## 5. Agent runtime contract

The runtime port must expose capabilities explicitly. Pause, resume, attach, structured tool events, token usage, and cancellation are not universal CLI features. A caller must check capabilities before invoking optional operations. Missing usage is unknown, not zero.

Adapters own process launch, output decoding, process termination, and runtime-specific protocol details. Application use cases own task dispatch and policy checks. Never allow a renderer to invoke a CLI directly.

## 6. Governance and safety invariants

- Permission checks execute at the tool/process boundary, not only in UI.
- An approval is immutable and scoped to the action, workspace, command, and relevant inputs it authorizes.
- A changed command or changed scope invalidates the prior approval.
- High-risk operations remain approval-gated; no silent Git push, commit, merge, deploy, or destructive action.
- Budget and usage are separate from estimates. Unknown usage must remain unknown.
- Worktree boundaries are enforced for file and shell operations.

## 7. Persistence and recovery

Keep the existing atomic JSON manifest and local-first storage model in the first migration stages. Introduce an append-only event journal as the durable execution evidence source, then derive snapshots/projections from it. SSE and in-memory notification buses are delivery mechanisms, never the source of truth.

Recovery invariants:
1. Persist the intent to start an attempt before launching its process.
2. Persist process/session identifiers as soon as they are known.
3. Record terminal attempt outcomes before projecting Run status.
4. On restart, reconcile persisted active attempts with process state; mark unresolvable attempts interrupted rather than silently successful.
5. Preserve historical attempts and artifacts.

## 8. Migration sequence

### Phase 0 — additive contracts
- Add runtime-neutral domain types and state transition helpers.
- Add deterministic DAG validation/topological ordering.
- Add agent runtime and event-store ports plus a capability-aware registry.
- Publish this architecture RFC.
- Do not change the existing Run manager or on-disk schema.

### Phase 1 — event journal and projections
- Implement filesystem-backed append-only event storage with atomic writes and schema versioning.
- Project legacy Run events into a unified execution timeline.
- Add recovery reconciliation and idempotency keys.

### Phase 2 — application services
- Extract scheduler, dependency resolver, policy gate, execution manager, and recovery manager from the current Run manager behind use-case boundaries.
- Keep facade exports stable through `src/core/index.ts`.
- Add contract tests around legacy Run/Manifest compatibility.

### Phase 3 — workbench
- Add Mission context and plan revisions.
- Add process-tree/timeline projections, diff review, artifact provenance, and delivery approvals.
- Keep Plan Graph and Execution Trace as separate views over shared Mission context.

### Phase 4 — governance expansion
- Add agent roles, budgets, goals, and audit views where validated by real workflows.
- Avoid remote multi-tenant services until there is a concrete product requirement.

## 9. Acceptance criteria

- Existing workflows and run manifests remain readable without migration.
- DAG validation rejects duplicate IDs, missing dependencies, self-edges, and cycles.
- Runtime adapters declare capabilities and reject unsupported operations clearly.
- Approval scope is checked again at execution time.
- Event persistence is durable before it is used for recovery claims.
- UI events can be lost and replayed from persisted evidence.
- No destructive Git action is performed implicitly.

## 10. Initial repository boundaries

```text
src/
  domain/v2/       # runtime-neutral types, state machines, graph algorithms
  ports/v2/        # runtime and persistence contracts
  adapters/        # concrete CLI, filesystem, process adapters
  application/     # use cases extracted incrementally
  core/            # stable public facade
```

This branch introduces only the additive Phase 0 foundation. Later phases require concrete persistence, runtime integration, UI work, and migration tests; they are intentionally not represented by empty implementations.
