/**
 * Checkpoint data model.
 *
 * A checkpoint represents saved agent state for resume after preemption.
 */

import { z } from "zod";

export const CheckpointStatus = {
  WRITING: "writing",
  COMPLETE: "complete",
  RESTORED: "restored",
  EXPIRED: "expired",
  FAILED: "failed",
} as const;

export type CheckpointStatus = (typeof CheckpointStatus)[keyof typeof CheckpointStatus];

export const CheckpointFormat = {
  JSON: "json",
  BINARY: "binary",
} as const;

export type CheckpointFormat = (typeof CheckpointFormat)[keyof typeof CheckpointFormat];

export const CheckpointSchema = z.object({
  id: z.string(),
  leaseId: z.string(),
  agentId: z.string(),

  // Storage
  uri: z.string(),
  sizeBytes: z.number(),
  format: z.enum(["json", "binary"]).default("json"),

  // Timing
  createdAt: z.date(),
  expiresAt: z.date(),
  durationMs: z.number().default(0),

  // State
  status: z.enum(["writing", "complete", "restored", "expired", "failed"]),
  restoredToLeaseId: z.string().nullable().default(null),
  error: z.string().nullable().default(null),

  // Metadata
  checkpointVersion: z.string().default("1.0"),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

export interface CreateCheckpointInput {
  leaseId: string;
  agentId: string;
  uri: string;
  sizeBytes: number;
  format?: CheckpointFormat;
  durationMs?: number;
  expiresInMs?: number;
}

/**
 * Create a checkpoint record.
 */
export function createCheckpoint(input: CreateCheckpointInput): Omit<Checkpoint, "id"> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.expiresInMs ?? 24 * 60 * 60 * 1000)); // 24h default

  return {
    leaseId: input.leaseId,
    agentId: input.agentId,
    uri: input.uri,
    sizeBytes: input.sizeBytes,
    format: input.format ?? "json",
    createdAt: now,
    expiresAt,
    durationMs: input.durationMs ?? 0,
    status: CheckpointStatus.COMPLETE,
    restoredToLeaseId: null,
    error: null,
    checkpointVersion: "1.0",
  };
}

/**
 * Check if checkpoint is expired.
 */
export function isCheckpointExpired(checkpoint: Checkpoint): boolean {
  return checkpoint.expiresAt < new Date();
}

/**
 * Check if checkpoint can be restored.
 */
export function canRestoreCheckpoint(checkpoint: Checkpoint): boolean {
  return (
    checkpoint.status === CheckpointStatus.COMPLETE &&
    !isCheckpointExpired(checkpoint) &&
    checkpoint.restoredToLeaseId === null
  );
}

/**
 * Convert Firestore document to Checkpoint.
 */
export function checkpointFromFirestore(
  id: string,
  data: Record<string, unknown>
): Checkpoint {
  return {
    ...data,
    id,
    createdAt: (data.createdAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
    expiresAt: (data.expiresAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
  } as Checkpoint;
}

/**
 * Checkpoint state that tenant agents should serialize.
 */
export interface CheckpointState {
  checkpointVersion: string;
  agentType: string;
  createdAt: string;

  // Task state
  taskQueue: Array<{
    id: string;
    type: string;
    status: string;
    data: Record<string, unknown>;
  }>;

  // Working memory
  scratchpad: Record<string, unknown>;

  // Conversation (truncated)
  conversationHistory: Array<{
    role: string;
    content: string;
  }>;

  // Large artifacts stored separately
  artifacts: Record<string, string>;

  // Stats
  metadata: {
    totalApiCalls: number;
    tokensUsed: number;
    elapsedTimeSeconds: number;
  };
}

/**
 * Create an empty checkpoint state.
 */
export function createEmptyCheckpointState(agentType: string): CheckpointState {
  return {
    checkpointVersion: "1.0",
    agentType,
    createdAt: new Date().toISOString(),
    taskQueue: [],
    scratchpad: {},
    conversationHistory: [],
    artifacts: {},
    metadata: {
      totalApiCalls: 0,
      tokensUsed: 0,
      elapsedTimeSeconds: 0,
    },
  };
}
