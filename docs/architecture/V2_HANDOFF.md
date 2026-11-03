# Runframe V2 — Engineering Handoff

**Purpose:** This document is a practical handoff for the next engineer continuing V2. It records implemented scope, unfinished work, constraints, validation status, and a recommended execution order.
**Repository:** `daadi12138/Runframe`
**Working branch:** `architecture-v2`
**Architecture source of truth:** [ARCHITECTURE_V2.md](./ARCHITECTURE_V2.md)
**Last handoff update:** 2026-11-03

> V2 is not complete. Treat checked items below as implemented according to the branch's code/documentation, not as independently verified by a clean local test run. Do not infer CI success from an empty status response.

## 1. Current branch and collaboration state

- All V2 work described here is on `architecture-v2`; `main` has not been changed.
- No pull request has been created and no merge has occurred.
- The latest branch comparison observed during this handoff: `architecture-v2` is **381 commits ahead, 0 behind** `main`. Commit count is not a quality or completion metric.
- GitHub Contents API writes create individual commits. Do not squash, rebase, or rewrite this branch without explicit authorization.
- A local clone was not available in the working environment. An old archive is not a valid representation of the current branch and must not be used for verification.

## 2. Implemented scope

### Domain and planning
- [x] Additive V2 Mission, PlanRevision, TaskNode, Attempt, Approval, Artifact, ExecutionEvent and ProcessTree contracts/state transitions.
- [x] DAG validation, deterministic ordering and ready-task scheduling; invalid IDs/edges, duplicates, self-dependencies and cycles are rejected.
- [x] Immutable validated Plan revisions and Mission lifecycle services/repositories.
- [x] Mission and Plan APIs and Mission Plan UI: Mission acceptance criteria, task descriptions/criteria, dependency editing, immutable plan saves, executor selection and per-task Codex/Claude assignment with Mission-default inheritance.
- [x] A pure Mission Plan-to-legacy-Run command mapper validates exact Plan/task content and provenance.

### Durable execution evidence and recovery
- [x] Filesystem JSONL event journal with schema versioning, sequence validation, replay, idempotency, writer locking, stale/dead lock handling, torn-tail recovery and fsync behavior.
- [x] Journal integration with legacy Run manifest persistence and a timeline read API/UI.
- [x] Legacy Run facts projected into V2 timeline/Attempt evidence; recovery reconciliation uses durable Attempt facts and process liveness.
- [x] Mission Run linkage reconciliation after a crash between Run creation and Mission linkage.
- [x] Persist session/process lifecycle evidence, including observed PID, timestamps, exit code/signal; bounded journal output projection with omission accounting.
- [x] Capture native Codex thread ID and Claude Code session ID when present in emitted CLI events. Attempt ID remains the stable Runframe runtime session fallback.

### Governance and runtime
- [x] Exact-scope append-only approval decisions with serialized decisions and fail-closed validation.
- [x] Validation command approval audit bridge and execution-gate rechecks.
- [x] AgentExecutionPolicy for executor/runtime readiness and subprocess environment allowlisting.
- [x] AgentRuntime port, capability-aware registry, AgentRunnerRegistry, AgentAttemptService and OneShotCliAgentRuntime bridge.
- [x] Codex/Claude execution flows through the V2 runtime registry and existing AgentTool/Worktree policy boundary for task attempts.
- [x] Streaming/backpressure, normalized structured output, cancellation and terminal outcome handling.
- [x] Unsupported runtime features remain explicitly false: pause, resume, attach and usage reporting. Do not invent support.

### Process tree, review and delivery
- [x] Validated ProcessTreeNode contract and event projection with parentage, lifecycle, duplicate, orphan, cycle and Run-boundary checks.
- [x] Mission Review evidence API validates Mission + exact PlanRevision provenance and assembles events, process tree, attempts, artifact hashes, delivery metadata and workspace approval decisions.
- [x] Mission Review UI summarizes attempts, session/process identity, exit facts, input artifacts and trace omission counts.
- [x] Delivery is gated by a persisted receipt; a successful Run alone cannot mark the Mission delivered. No-change runs have an explicit receipt; user confirmation remains required.
- [x] Initial reusable diff review validation primitive: reject absolute/traversal paths and bound patch preview bytes and path count. This is a safety building block, not a completed interactive diff viewer.

### Extraction and developer workflow
- [x] ProcessSupervisor adapter contains active child-process registry, PID liveness and termination operations.
- [x] `architecture-v2.yml` workflow defines unit-test, strict typecheck and Next.js production build gates.
- [x] V2 contracts/use cases are exported through `src/core/index.ts`.

## 3. Known unfinished work — do not mark complete

### P0 — Finish Review/Diff/Conflict flow
- [ ] Produce patch content from the approved/reviewed Worktree through a constrained application/adapter boundary.
- [ ] Validate every path and patch size before returning or rendering it; ensure redaction and bounded output. Never expose arbitrary filesystem reads or allow path traversal.
- [ ] Extend review API/UI with readable patch preview, changed-file list, conflict paths/reasons, and explicit human resolution/approval state.
- [ ] Add tests for malicious paths, oversized patches, binary/renamed/deleted files, conflict metadata, and delivery receipt transitions.
- [ ] Keep delivery decisions explicit. Never auto-commit, push, merge, deploy, or silently overwrite conflict resolution.

### P0 — Remove remaining Legacy Run Manager execution-engine boundary incrementally
- [ ] Extract command spawning into a process adapter with explicit input/output/exit/cancel contracts.
- [ ] Move Run state orchestration and remaining policy gates behind application use cases/ports.
- [ ] Make the V2 execution engine the actual Mission dispatch path; retain a thin compatibility facade for old Run APIs/manifests.
- [ ] Preserve old manifest behavior and on-disk compatibility. Avoid a big-bang rewrite.
- [ ] Add focused tests for spawn failures, cancellation races, terminal event durability, policy denials, child cleanup and failure propagation.

### P1 — Native runtime session semantics
- [ ] Inspect current supported Codex and Claude CLI protocols/versions for native session continue/resume/attach semantics; document exact protocol/CLI version requirements.
- [ ] Implement only capabilities demonstrably supported by the adapter. Until then keep pause/resume/attach false.
- [ ] Native child-agent/session and nested subprocess capture is not implemented. Add only where the CLI emits reliable identity/parentage; do not infer process-tree relationships.
- [ ] Clarify cancellation behavior and avoid treating native session IDs as OS process cancellation keys unless the adapter contract explicitly supports that mapping.

### P1 — Compatibility and integration tests
- [ ] Legacy Run Manifest → V2 journal/Attempt projection and replay compatibility.
- [ ] Mission dispatch idempotency and crash/reconciliation paths.
- [ ] Policy + exact approval + Worktree gate integration.
- [ ] Process lifecycle, cancellation race, process exit journal failure propagation.
- [ ] Delivery approval, conflicts, artifact provenance and Mission state E2E.
- [ ] Review whether root-level tests such as `src/run-manager.test.ts` are included by the current test script; ensure relevant tests run.
- [ ] Test migration and corrupted/partial persistence behavior, not just isolated pure functions.

### P1 — Verification and CI
- [ ] Obtain a current checkout of `architecture-v2` in a supported environment.
- [ ] Run `npm ci` (or repository-approved install), then `npm test`, `npm run typecheck`, and `npm run build`.
- [ ] Fix failures and rerun all gates; capture the exact commit SHA and logs.
- [ ] Inspect GitHub Actions for the exact commit. The observed combined statuses and workflow-runs responses were empty; this is **unknown**, not passing.
- [ ] Review for dependency/security issues and ensure no secrets or local paths entered committed fixtures.

### P2 — Later governance expansion
- [ ] Agent roles, budgets, goals and audit views only when validated by real workflows.
- [ ] Keep local-first modular monolith; do not introduce a remote multi-tenant control plane without a concrete requirement.

## 4. Important code boundaries / starting points

| Area | Files / directories |
| --- | --- |
| Domain model and state | `src/domain/v2/` |
| Runtime/event/mission ports | `src/ports/v2/` |
| V2 use cases | `src/application/v2/` |
| Filesystem and process adapters | `src/adapters/persistence/`, `src/adapters/process/` |
| Agent runtime bridge/registry | `src/adapters/agent-runtime/` |
| Legacy Run integration | `src/adapters/legacy-run/`, `src/run-manager.ts` |
| Mission API and review | `src/app/api/missions/` |
| Mission Plan and review UI | `src/app/mission-plan-panel.tsx` |
| Public core facade | `src/core/index.ts` |
| Architecture decisions/checklist | `docs/architecture/ARCHITECTURE_V2.md` |

## 5. Non-negotiable invariants

1. Plan Graph is intended work; Execution Trace/Process Tree is observed work. Do not conflate or mutate one into the other.
2. A retry creates a new Attempt; preserve prior attempts and evidence.
3. Unknown usage remains unknown, not zero.
4. Runtime capabilities are explicit and must be checked before use.
5. Approval is immutable and exact-scope; any changed action/workspace/inputs require a new authorization.
6. Enforce permission and Worktree boundaries at execution/tool boundaries, not just in UI.
7. No silent commit, push, merge, deploy, destructive operation, or conflict overwrite.
8. V2 remains additive until explicit compatibility/migration work proves otherwise.
9. Journal durability and provenance are correctness requirements, not best-effort telemetry.

## 6. Recommended order for the next engineer

1. Establish a clean checkout and run the full existing test/typecheck/build gates; record baseline failures before changing code.
2. Implement and test constrained Worktree diff acquisition and wire the existing diff validation primitive into the Review API.
3. Complete the interactive diff/conflict UI and delivery state transitions with integration tests.
4. Extract process spawning behind an adapter; add lifecycle/cancellation tests.
5. Move Run orchestration/policy behind V2 use cases and switch Mission dispatch to the V2-owned engine while preserving legacy facade behavior.
6. Add manifest migration/compatibility, dispatcher crash recovery and delivery E2E tests.
7. Evaluate native runtime session features only after verifying CLI protocol support; capability flags remain conservative.
8. Run all validation gates and inspect Actions for the exact commit before proposing PR/merge.

## 7. Validation status at handoff

- Local `npm test`: **not run**.
- Local `npm run typecheck`: **not run**.
- Local `npm run build`: **not run**.
- GitHub combined status: **empty/unverified** at last inspection.
- GitHub workflow runs: **empty/unverified** at last inspection.
- Therefore no statement that tests or CI passed is justified.
