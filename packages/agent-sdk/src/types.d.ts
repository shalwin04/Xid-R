/**
 * Type definitions for Xid-R A2A protocol and MCP tools.
 */
import { z } from "zod";
/**
 * Reclaim request sent by Xid-R Negotiator to tenant agent.
 */
export declare const ReclaimRequestSchema: z.ZodObject<{
    type: z.ZodLiteral<"reclaim_request">;
    lease_id: z.ZodString;
    grace_period_seconds: z.ZodNumber;
    reason: z.ZodEnum<["spot_preemption", "utilization_spike", "maintenance", "manual"]>;
    options: z.ZodArray<z.ZodObject<{
        action: z.ZodEnum<["checkpoint", "migrate", "accept_loss"]>;
        target: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        action: "checkpoint" | "migrate" | "accept_loss";
        target?: string | undefined;
    }, {
        action: "checkpoint" | "migrate" | "accept_loss";
        target?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    options: {
        action: "checkpoint" | "migrate" | "accept_loss";
        target?: string | undefined;
    }[];
    type: "reclaim_request";
    reason: "spot_preemption" | "utilization_spike" | "maintenance" | "manual";
    lease_id: string;
    grace_period_seconds: number;
}, {
    options: {
        action: "checkpoint" | "migrate" | "accept_loss";
        target?: string | undefined;
    }[];
    type: "reclaim_request";
    reason: "spot_preemption" | "utilization_spike" | "maintenance" | "manual";
    lease_id: string;
    grace_period_seconds: number;
}>;
export type ReclaimRequest = z.infer<typeof ReclaimRequestSchema>;
/**
 * Response from tenant agent to reclaim request.
 */
export declare const ReclaimResponseSchema: z.ZodObject<{
    type: z.ZodLiteral<"reclaim_response">;
    lease_id: z.ZodString;
    chosen_action: z.ZodEnum<["checkpoint", "migrate", "accept_loss"]>;
    estimated_duration_seconds: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "reclaim_response";
    chosen_action: "checkpoint" | "migrate" | "accept_loss";
    lease_id: string;
    estimated_duration_seconds?: number | undefined;
}, {
    type: "reclaim_response";
    chosen_action: "checkpoint" | "migrate" | "accept_loss";
    lease_id: string;
    estimated_duration_seconds?: number | undefined;
}>;
export type ReclaimResponse = z.infer<typeof ReclaimResponseSchema>;
/**
 * Checkpoint completion notification.
 */
export declare const CheckpointCompleteSchema: z.ZodObject<{
    type: z.ZodLiteral<"checkpoint_complete">;
    lease_id: z.ZodString;
    checkpoint_uri: z.ZodString;
    state_size_bytes: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "checkpoint_complete";
    lease_id: string;
    checkpoint_uri: string;
    state_size_bytes: number;
}, {
    type: "checkpoint_complete";
    lease_id: string;
    checkpoint_uri: string;
    state_size_bytes: number;
}>;
export type CheckpointComplete = z.infer<typeof CheckpointCompleteSchema>;
/**
 * Resume notification sent to agent when new capacity is available.
 */
export declare const ResumeNotificationSchema: z.ZodObject<{
    type: z.ZodLiteral<"resume_notification">;
    lease_id: z.ZodString;
    new_lease_id: z.ZodString;
    checkpoint_uri: z.ZodString;
    connection_info: z.ZodObject<{
        host: z.ZodString;
        port: z.ZodNumber;
        gpu_device: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        port: number;
        gpu_device: string;
        host: string;
    }, {
        port: number;
        gpu_device: string;
        host: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "resume_notification";
    lease_id: string;
    connection_info: {
        port: number;
        gpu_device: string;
        host: string;
    };
    checkpoint_uri: string;
    new_lease_id: string;
}, {
    type: "resume_notification";
    lease_id: string;
    connection_info: {
        port: number;
        gpu_device: string;
        host: string;
    };
    checkpoint_uri: string;
    new_lease_id: string;
}>;
export type ResumeNotification = z.infer<typeof ResumeNotificationSchema>;
/**
 * A2A task wrapper (matches Google A2A spec).
 */
export declare const A2ATaskSchema: z.ZodObject<{
    task_type: z.ZodString;
    data: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    task_type: string;
    data?: unknown;
}, {
    task_type: string;
    data?: unknown;
}>;
export type A2ATask = z.infer<typeof A2ATaskSchema>;
/**
 * A2A task response.
 */
export declare const A2ATaskResponseSchema: z.ZodObject<{
    status: z.ZodEnum<["completed", "working", "failed", "cancelled"]>;
    data: z.ZodOptional<z.ZodUnknown>;
    error: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "completed" | "failed" | "working" | "cancelled";
    error?: string | undefined;
    data?: unknown;
}, {
    status: "completed" | "failed" | "working" | "cancelled";
    error?: string | undefined;
    data?: unknown;
}>;
export type A2ATaskResponse = z.infer<typeof A2ATaskResponseSchema>;
/**
 * Request GPU input.
 */
export declare const RequestGpuInputSchema: z.ZodObject<{
    gpu_type: z.ZodEnum<["nvidia-t4", "nvidia-l4", "nvidia-a100-40gb", "nvidia-a100-80gb"]>;
    duration_hint_seconds: z.ZodDefault<z.ZodNumber>;
    priority: z.ZodDefault<z.ZodEnum<["low", "normal", "high"]>>;
    a2a_endpoint: z.ZodString;
    checkpointable: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    priority: "low" | "normal" | "high";
    checkpointable: boolean;
    gpu_type: "nvidia-t4" | "nvidia-l4" | "nvidia-a100-40gb" | "nvidia-a100-80gb";
    duration_hint_seconds: number;
    a2a_endpoint: string;
}, {
    gpu_type: "nvidia-t4" | "nvidia-l4" | "nvidia-a100-40gb" | "nvidia-a100-80gb";
    a2a_endpoint: string;
    priority?: "low" | "normal" | "high" | undefined;
    checkpointable?: boolean | undefined;
    duration_hint_seconds?: number | undefined;
}>;
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
export declare const CheckpointAckInputSchema: z.ZodObject<{
    lease_id: z.ZodString;
    checkpoint_uri: z.ZodString;
    size_bytes: z.ZodNumber;
    duration_ms: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    lease_id: string;
    checkpoint_uri: string;
    size_bytes: number;
    duration_ms?: number | undefined;
}, {
    lease_id: string;
    checkpoint_uri: string;
    size_bytes: number;
    duration_ms?: number | undefined;
}>;
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
export declare const ReleaseInputSchema: z.ZodObject<{
    lease_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    lease_id: string;
}, {
    lease_id: string;
}>;
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
export declare const StatusInputSchema: z.ZodObject<{
    lease_id: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    lease_id?: string | undefined;
}, {
    lease_id?: string | undefined;
}>;
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
//# sourceMappingURL=types.d.ts.map