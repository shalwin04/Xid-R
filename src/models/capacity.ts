/**
 * Capacity unit data model.
 *
 * A capacity unit represents a GPU resource that can be allocated to agents.
 */

import { z } from "zod";

export const CapacityStatus = {
  AVAILABLE: "available",
  RESERVED: "reserved",
  HARVESTABLE: "harvestable",
  LEASED: "leased",
  DRAINING: "draining",
} as const;

export type CapacityStatus = (typeof CapacityStatus)[keyof typeof CapacityStatus];

export const TrustTier = {
  INTERNAL: "internal",
  EXTERNAL: "external",
  UNTRUSTED: "untrusted",
} as const;

export type TrustTier = (typeof TrustTier)[keyof typeof TrustTier];

export const IsolationMode = {
  MPS: "mps",
  MIG: "mig",
  DEDICATED: "dedicated",
} as const;

export type IsolationMode = (typeof IsolationMode)[keyof typeof IsolationMode];

export const CapacityLane = {
  GKE_MPS: "gke_mps",
  GKE_DEDICATED: "gke_dedicated",
  SPOT_VM: "spot_vm",
  CLOUD_RUN: "cloud_run",
} as const;

export type CapacityLane = (typeof CapacityLane)[keyof typeof CapacityLane];

export const CapacityType = {
  GKE_NODE_GPU: "gke_node_gpu",
  SPOT_VM: "spot_vm",
  CLOUD_RUN_WORKER: "cloud_run_worker",
} as const;

export type CapacityType = (typeof CapacityType)[keyof typeof CapacityType];

export const CapacityUnitSchema = z.object({
  id: z.string(),
  type: z.enum(["gke_node_gpu", "spot_vm", "cloud_run_worker"]),

  // Location
  projectId: z.string(),
  zone: z.string(),
  clusterName: z.string().nullable().default(null),
  nodePool: z.string().nullable().default(null),
  instanceName: z.string().nullable().default(null),

  // GPU details
  gpuType: z.string(),
  gpuIndex: z.number().default(0),
  memoryGb: z.number(),

  // State
  status: z.enum(["available", "reserved", "harvestable", "leased", "draining"]),
  currentLeaseId: z.string().nullable().default(null),
  primaryWorkloadId: z.string().nullable().default(null),

  // Utilization
  utilizationPercent: z.number().default(0),
  utilizationUpdatedAt: z.date(),
  idleSince: z.date().nullable().default(null),

  // Trust
  trustTier: z.enum(["internal", "external", "untrusted"]).default("internal"),
  isolationMode: z.enum(["mps", "mig", "dedicated"]).default("dedicated"),

  // Capacity lane config
  preemptionGraceMs: z.number().default(120000),
  onDemandHourlyUsd: z.number(),

  // Metadata
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CapacityUnit = z.infer<typeof CapacityUnitSchema>;

export interface CreateCapacityUnitInput {
  type: CapacityType;
  projectId: string;
  zone: string;
  gpuType: string;
  memoryGb: number;
  onDemandHourlyUsd: number;
  clusterName?: string;
  nodePool?: string;
  instanceName?: string;
  gpuIndex?: number;
  trustTier?: TrustTier;
  isolationMode?: IsolationMode;
}

/**
 * Check if capacity unit is available for allocation.
 */
export function isCapacityAvailable(unit: CapacityUnit): boolean {
  return [CapacityStatus.AVAILABLE, CapacityStatus.HARVESTABLE].includes(
    unit.status as CapacityStatus
  );
}

/**
 * Check if capacity unit can be harvested (idle for long enough).
 */
export function canHarvest(unit: CapacityUnit, thresholdMs: number): boolean {
  if (unit.status !== CapacityStatus.RESERVED) return false;
  if (!unit.idleSince) return false;
  const idleDuration = Date.now() - unit.idleSince.getTime();
  return idleDuration >= thresholdMs;
}

/**
 * Get the capacity lane for a unit.
 */
export function getCapacityLane(unit: CapacityUnit): CapacityLane {
  switch (unit.type) {
    case CapacityType.SPOT_VM:
      return CapacityLane.SPOT_VM;
    case CapacityType.CLOUD_RUN_WORKER:
      return CapacityLane.CLOUD_RUN;
    case CapacityType.GKE_NODE_GPU:
      return unit.isolationMode === IsolationMode.MPS
        ? CapacityLane.GKE_MPS
        : CapacityLane.GKE_DEDICATED;
    default:
      return CapacityLane.GKE_DEDICATED;
  }
}

/**
 * Convert Firestore document to CapacityUnit.
 */
export function capacityUnitFromFirestore(
  id: string,
  data: Record<string, unknown>
): CapacityUnit {
  return {
    ...data,
    id,
    utilizationUpdatedAt:
      (data.utilizationUpdatedAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
    idleSince: (data.idleSince as { toDate: () => Date })?.toDate?.() ?? null,
    createdAt: (data.createdAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
    updatedAt: (data.updatedAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
  } as CapacityUnit;
}
