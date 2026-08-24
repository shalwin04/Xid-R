/**
 * Capacity unit collection operations.
 */

import { FieldValue } from "@google-cloud/firestore";
import {
  CapacityUnit,
  CapacityStatus,
  CreateCapacityUnitInput,
  capacityUnitFromFirestore,
  getCapacityLane,
} from "../models/capacity.js";
import { generateCapacityUnitId } from "../utils/ids.js";
import { createLogger } from "../utils/logger.js";
import { getCollection, Collections } from "./firestore.js";

const logger = createLogger({ module: "db:capacity" });

/**
 * Create or update a capacity unit.
 */
export async function upsertCapacityUnit(
  input: CreateCapacityUnitInput
): Promise<CapacityUnit> {
  const identifier =
    input.instanceName ?? `${input.clusterName}_${input.nodePool}_gpu${input.gpuIndex ?? 0}`;
  const id = generateCapacityUnitId(input.type, identifier);
  const now = new Date();

  const existing = await getCapacityUnit(id);

  if (existing) {
    // Update utilization timestamp
    await updateCapacityUnit(id, { utilizationUpdatedAt: now });
    return { ...existing, utilizationUpdatedAt: now };
  }

  const unit: Omit<CapacityUnit, "id"> = {
    type: input.type,
    projectId: input.projectId,
    zone: input.zone,
    clusterName: input.clusterName ?? null,
    nodePool: input.nodePool ?? null,
    instanceName: input.instanceName ?? null,
    gpuType: input.gpuType,
    gpuIndex: input.gpuIndex ?? 0,
    memoryGb: input.memoryGb,
    status: CapacityStatus.AVAILABLE,
    currentLeaseId: null,
    primaryWorkloadId: null,
    utilizationPercent: 0,
    utilizationUpdatedAt: now,
    idleSince: now,
    trustTier: input.trustTier ?? "internal",
    isolationMode: input.isolationMode ?? "dedicated",
    preemptionGraceMs: input.type === "spot_vm" ? 120000 : 30000,
    onDemandHourlyUsd: input.onDemandHourlyUsd,
    createdAt: now,
    updatedAt: now,
  };

  await getCollection(Collections.CAPACITY_UNITS).doc(id).set(unit);
  logger.info("Created capacity unit", { unitId: id, gpuType: input.gpuType });

  return { id, ...unit };
}

/**
 * Get a capacity unit by ID.
 */
export async function getCapacityUnit(id: string): Promise<CapacityUnit | null> {
  const doc = await getCollection(Collections.CAPACITY_UNITS).doc(id).get();
  if (!doc.exists) return null;
  return capacityUnitFromFirestore(doc.id, doc.data() as Record<string, unknown>);
}

/**
 * Update a capacity unit.
 */
export async function updateCapacityUnit(
  id: string,
  updates: Partial<Omit<CapacityUnit, "id" | "createdAt">>
): Promise<CapacityUnit | null> {
  const ref = getCollection(Collections.CAPACITY_UNITS).doc(id);

  await ref.update({
    ...updates,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const doc = await ref.get();
  if (!doc.exists) return null;
  return capacityUnitFromFirestore(doc.id, doc.data() as Record<string, unknown>);
}

/**
 * Get available capacity units for a GPU type.
 */
export async function getAvailableCapacity(gpuType: string): Promise<CapacityUnit[]> {
  const snapshot = await getCollection(Collections.CAPACITY_UNITS)
    .where("gpuType", "==", gpuType)
    .where("status", "in", [CapacityStatus.AVAILABLE, CapacityStatus.HARVESTABLE])
    .orderBy("utilizationPercent", "asc")
    .get();

  return snapshot.docs.map((doc) =>
    capacityUnitFromFirestore(doc.id, doc.data() as Record<string, unknown>)
  );
}

/**
 * Get all capacity units.
 */
export async function getAllCapacityUnits(): Promise<CapacityUnit[]> {
  const snapshot = await getCollection(Collections.CAPACITY_UNITS).get();
  return snapshot.docs.map((doc) =>
    capacityUnitFromFirestore(doc.id, doc.data() as Record<string, unknown>)
  );
}

/**
 * Get harvestable capacity (idle for long enough).
 */
export async function getHarvestableCapacity(
  idleThresholdMs: number
): Promise<CapacityUnit[]> {
  const threshold = new Date(Date.now() - idleThresholdMs);

  const snapshot = await getCollection(Collections.CAPACITY_UNITS)
    .where("status", "==", CapacityStatus.RESERVED)
    .where("idleSince", "<=", threshold)
    .get();

  return snapshot.docs.map((doc) =>
    capacityUnitFromFirestore(doc.id, doc.data() as Record<string, unknown>)
  );
}

/**
 * Update utilization for a capacity unit.
 */
export async function updateUtilization(
  id: string,
  utilizationPercent: number,
  idleThresholdPercent: number
): Promise<CapacityUnit | null> {
  const unit = await getCapacityUnit(id);
  if (!unit) return null;

  const now = new Date();
  const isIdle = utilizationPercent < idleThresholdPercent;

  const updates: Partial<CapacityUnit> = {
    utilizationPercent,
    utilizationUpdatedAt: now,
  };

  // Track when utilization dropped below threshold
  if (isIdle && !unit.idleSince) {
    updates.idleSince = now;
  } else if (!isIdle) {
    updates.idleSince = null;
  }

  return updateCapacityUnit(id, updates);
}

/**
 * Reserve capacity for a lease.
 */
export async function reserveCapacity(
  unitId: string,
  leaseId: string
): Promise<CapacityUnit | null> {
  return updateCapacityUnit(unitId, {
    status: CapacityStatus.LEASED,
    currentLeaseId: leaseId,
  });
}

/**
 * Release capacity from a lease.
 */
export async function releaseCapacity(unitId: string): Promise<CapacityUnit | null> {
  return updateCapacityUnit(unitId, {
    status: CapacityStatus.AVAILABLE,
    currentLeaseId: null,
  });
}

/**
 * Mark capacity as draining (preparing for preemption).
 */
export async function markDraining(unitId: string): Promise<CapacityUnit | null> {
  return updateCapacityUnit(unitId, {
    status: CapacityStatus.DRAINING,
  });
}

/**
 * Delete a capacity unit (when VM is terminated).
 */
export async function deleteCapacityUnit(id: string): Promise<void> {
  await getCollection(Collections.CAPACITY_UNITS).doc(id).delete();
  logger.info("Deleted capacity unit", { unitId: id });
}

/**
 * Get capacity summary.
 */
export async function getCapacitySummary(): Promise<{
  total: number;
  available: number;
  leased: number;
  harvestable: number;
  byGpuType: Record<string, { total: number; available: number }>;
}> {
  const units = await getAllCapacityUnits();

  const summary = {
    total: units.length,
    available: 0,
    leased: 0,
    harvestable: 0,
    byGpuType: {} as Record<string, { total: number; available: number }>,
  };

  for (const unit of units) {
    // Count by status
    if (unit.status === CapacityStatus.AVAILABLE) summary.available++;
    else if (unit.status === CapacityStatus.LEASED) summary.leased++;
    else if (unit.status === CapacityStatus.HARVESTABLE) summary.harvestable++;

    // Count by GPU type
    if (!summary.byGpuType[unit.gpuType]) {
      summary.byGpuType[unit.gpuType] = { total: 0, available: 0 };
    }
    summary.byGpuType[unit.gpuType].total++;
    if (unit.status === CapacityStatus.AVAILABLE || unit.status === CapacityStatus.HARVESTABLE) {
      summary.byGpuType[unit.gpuType].available++;
    }
  }

  return summary;
}
