/**
 * Lease data model.
 *
 * A lease represents an allocation of GPU capacity to a tenant agent.
 */

import { z } from "zod";

export const LeaseStatus = {
  PENDING: "pending",
  ACTIVE: "active",
  NEGOTIATING: "negotiating",
  CHECKPOINTING: "checkpointing",
  CHECKPOINTED: "checkpointed",
  RESUMING: "resuming",
  COMPLETED: "completed",
  LOST: "lost",
} as const;

export type LeaseStatus = (typeof LeaseStatus)[keyof typeof LeaseStatus];

export const ReleaseReason = {
  VOLUNTARY: "voluntary",
  PREEMPTED: "preempted",
  TIMEOUT: "timeout",
  ERROR: "error",
} as const;

export type ReleaseReason = (typeof ReleaseReason)[keyof typeof ReleaseReason];

export const Priority = {
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
} as const;

export type Priority = (typeof Priority)[keyof typeof Priority];

export const GpuType = {
  NVIDIA_T4: "nvidia-t4",
  NVIDIA_L4: "nvidia-l4",
  NVIDIA_A100_40GB: "nvidia-a100-40gb",
  NVIDIA_A100_80GB: "nvidia-a100-80gb",
} as const;

export type GpuType = (typeof GpuType)[keyof typeof GpuType];

export const LeaseSchema = z.object({
  id: z.string(),
  status: z.enum([
    "pending",
    "active",
    "negotiating",
    "checkpointing",
    "checkpointed",
    "resuming",
    "completed",
    "lost",
  ]),

  // Request details
  tenantAgentId: z.string(),
  requestedAt: z.date(),
  gpuType: z.string(),
  durationHintSeconds: z.number().default(3600),
  priority: z.enum(["low", "normal", "high"]).default("normal"),

  // Assignment
  capacityUnitId: z.string().nullable().default(null),
  grantedAt: z.date().nullable().default(null),
  capacityLane: z.string().nullable().default(null),

  // Connection info
  connectionHost: z.string().nullable().default(null),
  connectionPort: z.number().nullable().default(null),
  gpuDevice: z.string().nullable().default(null),
  preemptionWarningSeconds: z.number().default(120),

  // Checkpoint
  checkpointTargetUri: z.string().nullable().default(null),
  checkpointUri: z.string().nullable().default(null),
  checkpointSizeBytes: z.number().nullable().default(null),
  checkpointDurationMs: z.number().nullable().default(null),

  // Completion
  releasedAt: z.date().nullable().default(null),
  releaseReason: z.enum(["voluntary", "preempted", "timeout", "error"]).nullable().default(null),

  // Accounting
  billableSeconds: z.number().default(0),
  baselineCostUsd: z.number().default(0),
  actualCostUsd: z.number().default(0),
  savingsUsd: z.number().default(0),

  // Metadata
  createdAt: z.date(),
  updatedAt: z.date(),

  // A2A endpoint
  a2aEndpoint: z.string().nullable().default(null),
  checkpointable: z.boolean().default(true),
});

export type Lease = z.infer<typeof LeaseSchema>;

export interface CreateLeaseInput {
  tenantAgentId: string;
  gpuType: string;
  durationHintSeconds?: number;
  priority?: Priority;
  a2aEndpoint?: string;
  checkpointable?: boolean;
}

export interface LeaseConnectionInfo {
  host: string;
  port: number;
  gpuDevice: string;
}

/**
 * Check if lease is in an active state.
 */
export function isLeaseActive(lease: Lease): boolean {
  return [LeaseStatus.ACTIVE, LeaseStatus.NEGOTIATING, LeaseStatus.CHECKPOINTING].includes(
    lease.status as LeaseStatus
  );
}

/**
 * Check if lease is in a terminal state.
 */
export function isLeaseTerminal(lease: Lease): boolean {
  return [LeaseStatus.COMPLETED, LeaseStatus.LOST].includes(lease.status as LeaseStatus);
}

/**
 * Calculate savings vs on-demand pricing.
 */
export function calculateLeaseSavings(lease: Lease): number {
  return Math.max(0, lease.baselineCostUsd - lease.actualCostUsd);
}

/**
 * Convert Firestore timestamp to Date.
 */
export function leaseFromFirestore(id: string, data: Record<string, unknown>): Lease {
  return {
    ...data,
    id,
    requestedAt: (data.requestedAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
    grantedAt: (data.grantedAt as { toDate: () => Date })?.toDate?.() ?? null,
    releasedAt: (data.releasedAt as { toDate: () => Date })?.toDate?.() ?? null,
    createdAt: (data.createdAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
    updatedAt: (data.updatedAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
  } as Lease;
}
