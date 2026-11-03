export {
  approveProjectCommand,
  confirmProjectEnvironment,
  createProject,
  detectProjectEnvironment,
  diagnoseProject,
  importProject,
  isProjectCommandApproved,
  isProjectCommandApprovedWithAudit,
  listRecentProjects,
  loadProject,
  projectCommandKeys,
  revokeProjectCommand,
  resolveGitProject,
  type CommandApproval,
  type CommandSpec,
  type ProjectCommandKey,
  type ProjectConfig,
  type ProjectDiagnostic,
  type ProjectEnvironment,
  type RecentProject,
  type WorkspaceRoot,
} from '../project'

export {
  discoverExecutorModels,
  resolveExecutorForRun,
  scanLocalExecutors,
  type ExecutorEnvironment,
  type ExecutorEnvironmentReport,
  type ExecutorModelCatalog,
} from '../executor-config'

export {
  createWorkflow,
  deleteWorkflow,
  defaultWorkflowDefinition,
  loadWorkflowLibrary,
  loadWorkflowDefinition,
  publishWorkflow,
  resolvePublishedWorkflowRevision,
  saveWorkflowLibrary,
  saveWorkflowDefinition,
  updateWorkflowDraft,
  validateWorkflowDefinition,
  validateWorkflowLibrary,
  workflowTemplateIds,
  workflowTemplates,
  type WorkflowCanvasDefinition,
  type WorkflowCanvasEdge,
  type WorkflowCanvasNode,
  type WorkflowDraft,
  type WorkflowInputContract,
  type WorkflowLibrary,
  type WorkflowRecord,
  type PublishedWorkflowRevision,
  type ResolvedPublishedWorkflowRevision,
  type WorkflowTemplate,
  type WorkflowTemplateId,
} from '../workflow-config'

export {
  approveRun,
  answerRunInteraction,
  cancelRun,
  getRun,
  listRuns,
  pauseRun,
  readArtifactPayload,
  reviseArtifactPayload,
  rejectRun,
  requestRunInteraction,
  requestDeliveryApproval,
  restoreDeletedDeliveryFiles,
  resumeRun,
  resumeInterruptedRuns,
  retryRun,
  startRun,
  steerRun,
  validateRunGraph,
  type AgentPromptSnapshot,
  type AgentTraceEvent,
  type HumanInteractionKind,
  type HumanInteractionOption,
  type HumanInteractionRequest,
  type HumanInteractionSource,
  type RunEvent,
  type RunInput,
  type RunInputAttachment,
  type RunSnapshot,
  type MissionRunReference,
  type WorkflowRunReference,
} from '../run-manager'

export {
  buildRepositoryMap,
  executionStepContext,
  agentInstructionContext,
  intentPrompt,
  loadAgentInstructions,
  orchestrationReviewReason,
  parseIntentModelOutput,
  runStateGraph,
  textualAttachmentContext,
  type ExecutionPlan,
  type AgentInstruction,
  type IntentOrchestrationSnapshot,
  type IntentSpec,
  type IntentTaskType,
  type RepositoryMap,
} from '../intelligent-orchestration'

export {
  subscribeRunEvents,
  type RunChangedListener,
} from '../run-events'

export {
  cleanupStorage,
  getStorageOverview,
  previewStorageCleanup,
  type StorageCleanupPreview,
  type StorageCleanupResult,
  type StorageOverview,
  type StorageRunUsage,
} from '../storage-management'

export { schemaFor, validatePayload, type JsonSchema } from '../artifact-schema'

export {
  assessPermission,
  commandRisk,
  withinWorkspace,
  type PermissionDecision,
  type PermissionMode,
  type PermissionRequest,
  type PermissionResult,
  type ToolKind,
  type ToolRisk,
} from '../permission-policy'

export {
  AgentTool,
  FileTool,
  ShellTool,
  type AgentToolInput,
  type FileToolInput,
  type ShellToolInput,
  type ToolExecutionContext,
  type ToolExecutionResult,
  type ToolExecutor,
} from '../tool-executor'

export {
  listProjectFiles,
  readProjectFile,
  writeProjectFile,
  type ProjectFileEntry,
} from '../project-files'


// Additive V2 contracts. Legacy Run APIs above remain unchanged.
export type {
  AcceptanceCriterion,
  AgentCapabilities,
  AgentProfile,
  Approval,
  ApprovalScope,
  Artifact as V2Artifact,
  ExecutionEvent,
  ExecutionEventKind,
  Mission,
  MissionStatus,
  NodeAttempt,
  PlanRevision,
  TaskNode,
  TaskStatus,
  AttemptStatus,
} from '../domain/v2/model'
export {
  canTransitionMission,
  transitionAttempt,
  transitionMission,
  transitionTask,
} from '../domain/v2/state-machine'
export { getReadyTaskIds, validatePlanGraph, type GraphValidation } from '../domain/v2/graph'
export { AgentRuntimeRegistry } from '../adapters/agent-runtime/registry'
export { assertRuntimeCapability, type AgentLaunchRequest, type AgentOutputEvent, type AgentRuntime, type AgentSessionHandle } from '../ports/v2/agent-runtime'
export type { EventAppendOptions, EventReadOptions, ExecutionEventStore } from '../ports/v2/event-store'


export { FilesystemExecutionEventStore, createDefaultExecutionEventStore, type FilesystemExecutionEventStoreOptions } from '../adapters/persistence/filesystem-event-store'
export { FilesystemMissionRepository } from '../adapters/persistence/filesystem-mission-repository'
export type { MissionRepository } from '../ports/v2/mission-repository'

export { MissionService, type CreateMissionInput } from '../application/v2/mission-service'

export { createDefaultMissionRepository } from '../adapters/persistence/default-mission-repository'

export { FilesystemApprovalRepository, createDefaultApprovalRepository } from '../adapters/persistence/filesystem-approval-repository'
export type { ApprovalRepository } from '../ports/v2/approval-repository'
export { ApprovalService } from '../application/v2/approval-service'

export { MissionExecutionService, type DispatchMissionOptions, type DispatchMissionResult } from '../application/v2/mission-execution-service'
export type { MissionRunDispatcher, MissionRunDispatchRequest } from '../ports/v2/mission-run-dispatcher'
export { LegacyMissionRunDispatcher } from '../adapters/legacy-run/mission-run-dispatcher'

export { MissionDispatchService, type DispatchMissionInput } from '../application/v2/mission-dispatch-service'
export type { MissionRunEngine, MissionRunRequest, MissionRunReceipt } from '../ports/v2/mission-run-engine'
export { LegacyRunEngineAdapter } from '../adapters/run-engine/legacy-run-engine-adapter'
