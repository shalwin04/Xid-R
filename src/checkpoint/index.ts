/**
 * Checkpoint Module - Public API
 *
 * Export all checkpoint-related functionality for use by tenant agents.
 */

// SDK - Types
export type {
  CheckpointResult,
  RestoreResult,
  ProgressCallback,
  CheckpointConfig,
  XidrCheckpointable,
  CheckpointState,
  CheckpointFormat,
} from "./sdk.js";

// SDK - Classes
export {
  CheckpointHelper,
  CheckpointableAgent,
  MockCheckpointHelper,
} from "./sdk.js";

// Models - Types
export type {
  Checkpoint,
  CreateCheckpointInput,
} from "../models/checkpoint.js";

// Models - Values
export {
  CheckpointStatus,
  createCheckpoint,
  isCheckpointExpired,
  canRestoreCheckpoint,
  createEmptyCheckpointState,
} from "../models/checkpoint.js";

// Client - Types
export type {
  GpuType,
  Priority,
  LeaseStatus,
  XidrClientConfig,
  ConnectionInfo,
  GpuRequestOptions,
  GpuRequestResult,
  LeaseStatusResult,
  SystemStatusResult,
  ReleaseResult,
  CheckpointAckResult,
  ExplanationResult,
  PreemptionEvent,
  XidrClientEvents,
} from "./client.js";

// Client - Classes
export {
  XidrClient,
  createXidrClient,
} from "./client.js";
