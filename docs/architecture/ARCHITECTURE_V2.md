# Runframe Architecture V2

**Status:** Incremental architecture RFC — Phase 1 implementation in progress  
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
- [x] Implement filesystem-backed append-only JSONL event storage with schema versioning, per-run writer locking, dead-process lock recovery, torn-tail recovery, sequence validation, replay, idempotency keys, and fsync-before-append completion.
- [x] Add filesystem persistence for Mission records and immutable, validated Plan revisions.
- [x] Add unit tests for graph validation, state transitions, Mission/Plan persistence and dispatch, exact-scope approval decisions (including concurrent decisions), runtime registry contracts, event ordering, replay, torn-tail recovery, stale-lock reclamation races, live-lock safety, idempotency, and concurrent writers.
- [x] Validate persisted Mission, Plan Revision, and Approval records on replay; corrupt governance or planning data fails closed rather than being silently accepted.
- [x] Project legacy Run events into a replayable V2 execution timeline; the legacy Run manifest remains the compatibility projection.
- [x] Integrate journal appends into serialized Run manifest writes so the journal is durable before the manifest revision is committed.
- [x] Expose a paginated timeline read API and render the persisted event stream in the Mission Hub.
- [x] Reconcile active attempt starts, process attachment, pause/resume, completion, and failure from journal evidence during restart; the legacy manifest remains the broader compatibility snapshot.

### Phase 2 — application services
- [x] Add MissionService use cases for Mission creation, lifecycle transitions, and validated immutable Plan revisions.
- [x] Reconcile orphan Runs back to their Mission after a crash between Run creation and Mission linkage, using immutable Mission/Plan provenance on the Run.
- [x] Add ApprovalService with exact-scope matching, serialized concurrent decisions, and append-only grant/deny records; the latest decision for an exact scope governs authorization.
- [x] Serialize Mission dispatch requests per Mission within the local application process to prevent duplicate concurrent Runs.
- [x] Bridge existing validation-command allowlist approvals into immutable V2 audit records and recheck workspace, command, and input digest at the validation execution gate; Worktree-only approvals remain scoped to the executing Worktree.
- [x] Add Mission and Plan REST APIs, a MissionExecutionService use case, and a MissionRunDispatcher port. The LegacyMissionRunDispatcher converts a saved V2 Plan into an isolated legacy Run / Git Worktree execution without putting orchestration logic in the HTTP route.
- [x] Extract a pure dependency scheduler/resolver and use it from the existing Run orchestration loop; validate scheduler IDs, edge endpoints, duplicate edges, self-edges, and cycles before scheduling.
- [x] Extract AgentAttemptService for capability-checked AgentRuntime launch, streamed output consumption, terminal result handling, and cancellation; Run Manager remains the compatibility facade.
- [x] Extract pure AttemptRecovery reconciliation from Run Manager; persisted journal facts and observed process liveness now drive the recovered snapshot.
- [x] Extract executor readiness checks, runtime/runner registration checks, and subprocess environment allowlisting into AgentExecutionPolicy with focused unit tests.
- [ ] Extract the remaining policy gate and execution manager responsibilities from the current Run Manager behind use-case boundaries.
- [ ] Replace the remaining Legacy Run Manager execution-engine compatibility boundary with a fully V2-owned execution engine. The deterministic Mission Plan → Run command mapping now lives in a tested application use case; the thin LegacyMissionRunDispatcher adapter only invokes the compatibility Run Manager. Concrete Codex/Claude Attempts launch through AgentRuntimeRegistry inside its existing Worktree and AgentTool policy boundary.
- [x] Replace the ad-hoc Codex/Claude runner Map with an explicit AgentRunnerRegistry and bridge the registered Codex/Claude runners through OneShotCliAgentRuntime + AgentRuntimeRegistry. The actual Task Attempt now calls AgentRuntime.launch/output/cancel inside the existing AgentTool permission and Worktree boundary. Streaming, structured events, and cancellation are declared; pause, resume, attach, and usage reporting remain explicitly unsupported. Output buffering is bounded and applies lossless producer backpressure instead of dropping streamed events. If durable trace/output consumption fails, AgentAttemptService cancels the active runtime session and closes the queue so no detached producer remains blocked.
- [x] Keep V2 domain, scheduler, runtime registry, and runner registry contracts exposed through `src/core/index.ts`.
- [ ] Add contract tests around legacy Run/Manifest compatibility and migration behavior.
- [x] Retain the `architecture-v2.yml` GitHub Actions workflow for unit tests, strict TypeScript checking, and the Next.js production build; CI execution status remains unverified and must be checked from Actions before merge.

### Phase 3 — workbench
- [x] Add a V2 Mission / Plan Graph workspace alongside the existing Mission Hub, including Mission acceptance criteria, task descriptions and acceptance criteria, multi-dependency editing, and immutable Plan revision saves.
- [x] Add a persisted Execution Timeline projection alongside existing Run and Agent trace views.
- [x] Allow a saved V2 Plan to start a Run with an explicit executor and read-only / Worktree-write mode; persist the exact Mission and Plan Revision reference on the Run and reconcile completed or failed Runs into Mission review state.
- [x] Gate Mission delivery on a persisted Run delivery receipt: a successful Run alone cannot mark a Mission delivered; changed files require Worktree diff approval in the execution timeline, no-change runs record an explicit no-change receipt, and the user then confirms Mission delivery.
- [x] Add a Run → TaskNode → Attempt → Tool Event execution hierarchy in the Mission Hub.
- [ ] Extend the hierarchy to nested child-agent sessions and operating-system subprocess trees.
- [x] Add a normalized ProcessTreeNode domain contract and strict parentage/time/run-boundary validator.
- [x] Add a projection from normalized session/process lifecycle events into a validated process tree, with malformed payload, duplicate lifecycle, orphan, cycle, and cross-Run checks.
- [x] Emit Runframe-managed session start/output/end and OS CLI process start/exit facts (PID, exit code/signal) from the actual Codex/Claude Attempt lifecycle; expose the validated process-tree projection in the Mission UI. Mission Review renders the observed session/process hierarchy, PID, timestamps, exit code, and exit signal.
  - Session output journal projection is bounded to 1,000 events per Attempt and 4,000 characters per event; a terminal omission marker preserves the omitted count while the full redacted per-Attempt trace remains in `trace.jsonl`.
- [ ] Add native child-agent session hooks and capture nested tool subprocesses where the CLI exposes reliable identities.
- [x] Add a Mission Review evidence API that verifies the Run's Mission + exact immutable Plan Revision provenance and assembles execution events, process tree, Attempt links, Artifact hashes, delivery diff/receipt, and workspace-scoped approval decisions; surface the evidence summary in Mission planning UI. Mission Review now renders each Task Attempt's executor, state, timestamps, process identity/exit facts, input Artifact references, and bounded-manifest trace omission count.
- [ ] Complete interactive diff/conflict review and end-to-end validation of every evidence link before delivery.
- Keep Plan Graph and Execution Trace as separate views over shared Mission context.

### Phase 4 — governance expansion
- Add agent roles, budgets, goals, and audit views where validated by real workflows.
- Avoid remote multi-tenant services until there is a concrete product requirement.

## 9. Acceptance criteria

- [x] Existing workflows and run manifests remain readable without migration; V2 storage is additive.
- [x] DAG validation rejects duplicate IDs, missing dependencies, self-edges, duplicate dependencies, and cycles.
- [x] Runtime adapters declare capabilities and reject unsupported operations clearly at the port boundary.
- [x] Approval decisions are immutable and exact-scope; latest decision wins, and validation commands recheck the V2 decision at their execution gate.
- [x] Event appends are persisted and fsynced before the compatibility manifest is committed.
- [x] Timeline events can be replayed from the durable journal after SSE notifications are lost.
- [x] No new destructive Git action is introduced by V2 persistence or planning.
- [x] Active-attempt recovery reconciles the latest attempt facts from the durable journal, while retaining the legacy manifest as the compatibility snapshot for other Run state.
- [x] The Mission Plan is dispatchable through V2 Mission orchestration into the compatibility Run / Worktree engine with immutable Plan provenance.
- [x] The Mission Plan's Agent Attempts launch through registered V2 AgentRuntime adapters with capability-gated streaming and cancellation; session output and process lifecycle facts are persisted.
- [ ] Mission dispatch no longer crosses the LegacyMissionRunDispatcher / Run Manager compatibility boundary, and native child-agent attach/resume remains unsupported until a runtime can prove those capabilities.

## 10. Initial repository boundaries

```text
src/
  domain/v2/       # runtime-neutral types, state machines, graph algorithms
  ports/v2/        # runtime and persistence contracts
  adapters/        # concrete CLI, filesystem, process adapters
  application/     # use cases extracted incrementally
  core/            # stable public facade
```

This branch contains additive V2 contracts, durable Phase 1 persistence/timeline infrastructure, Mission/Plan/Approval services, REST APIs, and an integrated Mission planning workspace. Saved plans still cross the LegacyMissionRunDispatcher / Run Manager compatibility boundary into the isolated Run / Worktree engine, but actual Codex/Claude Task Attempts execute through registered OneShotCliAgentRuntime adapters behind the AgentRuntime port and existing AgentTool permission gate. The runtime streams normalized trace events, supports cancellation, and explicitly does not claim pause/resume/attach/usage. Session start/output/end and OS process start/exit facts are persisted in the journal, including exact observed exit signals; a validated process-tree endpoint and Mission Review hierarchy are present. The Mission Review API verifies exact Mission/Plan Revision provenance and assembles events, process tree, artifacts, diff, receipt, and workspace approval decisions. The existing `architecture-v2.yml` GitHub Actions workflow defines unit-test, strict typecheck, and production-build gates, but no successful CI result has yet been observed. Remaining work includes removing the legacy dispatcher boundary, native child-agent events, interactive diff/conflict review, the remaining Run Manager policy/execution decomposition, compatibility contract tests, and verified integration/CI execution.
