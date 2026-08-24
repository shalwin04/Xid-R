/**
 * Type definitions for Xid-R A2A protocol and MCP tools.
 */

import { z } from "zod";

// ============================================================================
// A2A Protocol Types
// ============================================================================

/**
 * Reclaim request sent by Xid-R Negotiator to tenant agent.
 */
export const ReclaimRequestSchema = z.object({
  type: z.literal("reclaim_request"),
  lease_id: z.string(),
  grace_period_seconds: z.number(),
  reason: z.enum(["spot_preemption", "utilization_spike", "maintenance", "manual"]),
  options: z.array(z.object({
    action: z.enum(["checkpoint", "migrate", "accept_loss"]),
    target: z.string().optional(),
  })),
});

export type ReclaimRequest = z.infer<typeof ReclaimRequestSchema>;

/**
 * Response from tenant agent to reclaim request.
 */
export const ReclaimResponseSchema = z.object({
  type: z.literal("reclaim_response"),
  lease_id: z.string(),
  chosen_action: z.enum(["checkpoint", "migrate", "accept_loss"]),
  estimated_duration_seconds: z.number().optional(),
});

export type ReclaimResponse = z.infer<typeof ReclaimResponseSchema>;

/**
 * Checkpoint completion notification.
 */
export const CheckpointCompleteSchema = z.object({
  type: z.literal("checkpoint_complete"),
  lease_id: z.string(),
  checkpoint_uri: z.string(),
  state_size_bytes: z.number(),
});

export type CheckpointComplete = z.infer<typeof CheckpointCompleteSchema>;

/**
 * Resume notification sent to agent when new capacity is available.
 */
export const ResumeNotificationSchema = z.object({
  type: z.literal("resume_notification"),
  lease_id: z.string(),
  new_lease_id: z.string(),
  checkpoint_uri: z.string(),
  connection_info: z.object({
    host: z.string(),
    port: z.number(),
    gpu_device: z.string(),
  }),
});

export type ResumeNotification = z.infer<typeof ResumeNotificationSchema>;

/**
 * A2A task wrapper (matches Google A2A spec).
 */
export const A2ATaskSchema = z.object({
  task_type: z.string(),
  data: z.unknown(),
});

export type A2ATask = z.infer<typeof A2ATaskSchema>;

/**
 * A2A task response.
 */
export const A2ATaskResponseSchema = z.object({
  status: z.enum(["completed", "working", "failed", "cancelled"]),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

export type A2ATaskResponse = z.infer<typeof A2ATaskResponseSchema>;

// ============================================================================
// MCP Tool Types
// ============================================================================

/**
 * Request GPU input.
 */
export const RequestGpuInputSchema = z.object({
  gpu_type: z.enum(["nvidia-t4", "nvidia-l4", "nvidia-a100-40gb", "nvidia-a100-80gb"]),
  duration_hint_seconds: z.number().default(3600),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  a2a_endpoint: z.string(),
  checkpointable: z.boolean().default(true),
});

export type RequestGpuInput = z.infer<typeof RequestGpuInputSchema>;

/**
 * Request GPU response.
 */
export interface RequestGpuResponse {
  lease_id: string;
  status: "granted" | "queued";
  capacity_unit_id?: string;
  connection_info?: {
    host: string;
    port: number;
    gpu_device: string;
  };
  preemption_warning_seconds?: number;
  checkpoint_target_uri?: string;
  queue_position?: number;
}

/**
 * Checkpoint acknowledgment input.
 */
export const CheckpointAckInputSchema = z.object({
  lease_id: z.string(),
  checkpoint_uri: z.string(),
  size_bytes: z.number(),
  duration_ms: z.number().optional(),
});

export type CheckpointAckInput = z.infer<typeof CheckpointAckInputSchema>;

/**
 * Checkpoint acknowledgment response.
 */
export interface CheckpointAckResponse {
  acknowledged: boolean;
  resume_queued: boolean;
  estimated_resume_wait_seconds?: number;
}

/**
 * Release lease input.
 */
export const ReleaseInputSchema = z.object({
  lease_id: z.string(),
});

export type ReleaseInput = z.infer<typeof ReleaseInputSchema>;

/**
 * Release lease response.
 */
export interface ReleaseResponse {
  released: boolean;
  billable_seconds: number;
  baseline_cost_usd: number;
  actual_cost_usd: number;
  savings_usd: number;
}

/**
 * Status query input.
 */
export const StatusInputSchema = z.object({
  lease_id: z.string().optional(),
});

export type StatusInput = z.infer<typeof StatusInputSchema>;

/**
 * Status query response.
 */
export interface StatusResponse {
  lease?: {
    id: string;
    status: string;
    gpu_type: string;
    capacity_lane?: string;
    granted_at?: string;
    checkpoint_uri?: string;
  };
  system?: {
    available_capacity: Record<string, number>;
    active_leases: number;
    queue_depth: number;
  };
}

// ============================================================================
// Checkpoint Types
// ============================================================================

/**
 * Result of a checkpoint operation.
 */
export interface CheckpointResult {
  success: boolean;
  uri?: string;
  size_bytes: number;
  duration_ms: number;
  error?: string;
}

/**
 * Result of a restore operation.
 */
export interface RestoreResult {
  success: boolean;
  state?: unknown;
  error?: string;
}

/**
 * Checkpoint metadata stored alongside state.
 */
export interface CheckpointMetadata {
  version: string;
  agent_type: string;
  created_at: string;
  lease_id: string;
  state_size_bytes: number;
}
