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
/**
 * Response from tenant agent to reclaim request.
 */
export const ReclaimResponseSchema = z.object({
    type: z.literal("reclaim_response"),
    lease_id: z.string(),
    chosen_action: z.enum(["checkpoint", "migrate", "accept_loss"]),
    estimated_duration_seconds: z.number().optional(),
});
/**
 * Checkpoint completion notification.
 */
export const CheckpointCompleteSchema = z.object({
    type: z.literal("checkpoint_complete"),
    lease_id: z.string(),
    checkpoint_uri: z.string(),
    state_size_bytes: z.number(),
});
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
/**
 * A2A task wrapper (matches Google A2A spec).
 */
export const A2ATaskSchema = z.object({
    task_type: z.string(),
    data: z.unknown(),
});
/**
 * A2A task response.
 */
export const A2ATaskResponseSchema = z.object({
    status: z.enum(["completed", "working", "failed", "cancelled"]),
    data: z.unknown().optional(),
    error: z.string().optional(),
});
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
/**
 * Checkpoint acknowledgment input.
 */
export const CheckpointAckInputSchema = z.object({
    lease_id: z.string(),
    checkpoint_uri: z.string(),
    size_bytes: z.number(),
    duration_ms: z.number().optional(),
});
/**
 * Release lease input.
 */
export const ReleaseInputSchema = z.object({
    lease_id: z.string(),
});
/**
 * Status query input.
 */
export const StatusInputSchema = z.object({
    lease_id: z.string().optional(),
});
//# sourceMappingURL=types.js.map