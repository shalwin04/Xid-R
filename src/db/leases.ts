/**
 * Lease collection operations.
 */

import { FieldValue } from "@google-cloud/firestore";
import {
  Lease,
  LeaseStatus,
  CreateLeaseInput,
  leaseFromFirestore,
} from "../models/lease.js";
import { generateLeaseId } from "../utils/ids.js";
import { createLogger } from "../utils/logger.js";
import { getCollection, Collections } from "./firestore.js";

const logger = createLogger({ module: "db:leases" });

/**
 * Create a new lease.
 */
export async function createLease(input: CreateLeaseInput): Promise<Lease> {
  const id = generateLeaseId();
  const now = new Date();

  const lease: Omit<Lease, "id"> = {
    status: LeaseStatus.PENDING,
    tenantId: input.tenantId ?? null,
    tenantAgentId: input.tenantAgentId,
    requestedAt: now,
    gpuType: input.gpuType,
    durationHintSeconds: input.durationHintSeconds ?? 3600,
    priority: input.priority ?? "normal",
    capacityUnitId: null,
    grantedAt: null,
    capacityLane: null,
    connectionHost: null,
    connectionPort: null,
    gpuDevice: null,
    preemptionWarningSeconds: 120,
    checkpointTargetUri: null,
    checkpointUri: null,
    checkpointSizeBytes: null,
    checkpointDurationMs: null,
    releasedAt: null,
    releaseReason: null,
    billableSeconds: 0,
    baselineCostUsd: 0,
    actualCostUsd: 0,
    savingsUsd: 0,
    createdAt: now,
    updatedAt: now,
    a2aEndpoint: input.a2aEndpoint ?? null,
    checkpointable: input.checkpointable ?? true,
  };

  await getCollection(Collections.LEASES).doc(id).set(lease);
  logger.info("Created lease", { leaseId: id, agentId: input.tenantAgentId });

  return { id, ...lease };
}

/**
 * Get a lease by ID.
 */
export async function getLease(id: string): Promise<Lease | null> {
  const doc = await getCollection(Collections.LEASES).doc(id).get();
  if (!doc.exists) return null;
  return leaseFromFirestore(doc.id, doc.data() as Record<string, unknown>);
}

/**
 * Update a lease.
 */
export async function updateLease(
  id: string,
  updates: Partial<Omit<Lease, "id" | "createdAt">>
): Promise<Lease | null> {
  const ref = getCollection(Collections.LEASES).doc(id);

  await ref.update({
    ...updates,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.debug("Updated lease", { leaseId: id, updates: Object.keys(updates) });

  const doc = await ref.get();
  if (!doc.exists) return null;
  return leaseFromFirestore(doc.id, doc.data() as Record<string, unknown>);
}

/**
 * Get leases by status.
 */
export async function getLeasesByStatus(status: LeaseStatus): Promise<Lease[]> {
  const snapshot = await getCollection(Collections.LEASES)
    .where("status", "==", status)
    .orderBy("requestedAt", "asc")
    .get();

  return snapshot.docs.map((doc) =>
    leaseFromFirestore(doc.id, doc.data() as Record<string, unknown>)
  );
}

/**
 * Get pending leases ordered by priority and request time.
 */
export async function getPendingLeases(): Promise<Lease[]> {
  const snapshot = await getCollection(Collections.LEASES)
    .where("status", "==", LeaseStatus.PENDING)
    .orderBy("requestedAt", "asc")
    .get();

  const leases = snapshot.docs.map((doc) =>
    leaseFromFirestore(doc.id, doc.data() as Record<string, unknown>)
  );

  // Sort by priority (high > normal > low), then by requestedAt
  const priorityOrder = { high: 0, normal: 1, low: 2 };
  return leases.sort((a, b) => {
    const pA = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1;
    const pB = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1;
    if (pA !== pB) return pA - pB;
    return a.requestedAt.getTime() - b.requestedAt.getTime();
  });
}

/**
 * Get active leases for a capacity unit.
 */
export async function getActiveLeaseForCapacity(
  capacityUnitId: string
): Promise<Lease | null> {
  const snapshot = await getCollection(Collections.LEASES)
    .where("capacityUnitId", "==", capacityUnitId)
    .where("status", "in", [
      LeaseStatus.ACTIVE,
      LeaseStatus.NEGOTIATING,
      LeaseStatus.CHECKPOINTING,
    ])
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return leaseFromFirestore(doc.id, doc.data() as Record<string, unknown>);
}

/**
 * Get leases for an agent.
 */
export async function getLeasesForAgent(agentId: string): Promise<Lease[]> {
  const snapshot = await getCollection(Collections.LEASES)
    .where("tenantAgentId", "==", agentId)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  return snapshot.docs.map((doc) =>
    leaseFromFirestore(doc.id, doc.data() as Record<string, unknown>)
  );
}

/**
 * Grant a lease (assign capacity).
 */
export async function grantLease(
  leaseId: string,
  capacityUnitId: string,
  capacityLane: string,
  connectionInfo: {
    host: string;
    port: number;
    gpuDevice: string;
  },
  preemptionWarningSeconds: number,
  checkpointBucket: string
): Promise<Lease | null> {
  const checkpointTargetUri = `gs://${checkpointBucket}/${leaseId}/`;

  return updateLease(leaseId, {
    status: LeaseStatus.ACTIVE,
    capacityUnitId,
    capacityLane,
    grantedAt: new Date(),
    connectionHost: connectionInfo.host,
    connectionPort: connectionInfo.port,
    gpuDevice: connectionInfo.gpuDevice,
    preemptionWarningSeconds,
    checkpointTargetUri,
  });
}

/**
 * Complete a lease (voluntary release).
 */
export async function completeLease(
  leaseId: string,
  billableSeconds: number,
  baselineCostUsd: number,
  actualCostUsd: number
): Promise<Lease | null> {
  return updateLease(leaseId, {
    status: LeaseStatus.COMPLETED,
    releasedAt: new Date(),
    releaseReason: "voluntary",
    billableSeconds,
    baselineCostUsd,
    actualCostUsd,
    savingsUsd: Math.max(0, baselineCostUsd - actualCostUsd),
  });
}

/**
 * Mark a lease as lost (failed checkpoint/preemption).
 */
export async function markLeaseLost(
  leaseId: string,
  reason: "preempted" | "timeout" | "error"
): Promise<Lease | null> {
  return updateLease(leaseId, {
    status: LeaseStatus.LOST,
    releasedAt: new Date(),
    releaseReason: reason,
  });
}

/**
 * Get leases in CHECKPOINTED status (ready for resume).
 */
export async function getCheckpointedLeases(): Promise<Lease[]> {
  const snapshot = await getCollection(Collections.LEASES)
    .where("status", "==", LeaseStatus.CHECKPOINTED)
    .orderBy("updatedAt", "asc")
    .limit(50)
    .get();

  return snapshot.docs.map((doc) =>
    leaseFromFirestore(doc.id, doc.data() as Record<string, unknown>)
  );
}

/**
 * Simple complete lease (just mark as completed, for resume handler).
 */
export async function simpleCompleteLease(leaseId: string): Promise<Lease | null> {
  return updateLease(leaseId, {
    status: LeaseStatus.COMPLETED,
    releasedAt: new Date(),
  });
}

/**
 * Get summary statistics.
 */
export async function getLeaseStats(): Promise<{
  active: number;
  pending: number;
  completed: number;
  lost: number;
  totalSavingsUsd: number;
}> {
  const [active, pending, completed, lost] = await Promise.all([
    getCollection(Collections.LEASES)
      .where("status", "in", [LeaseStatus.ACTIVE, LeaseStatus.NEGOTIATING])
      .count()
      .get(),
    getCollection(Collections.LEASES)
      .where("status", "==", LeaseStatus.PENDING)
      .count()
      .get(),
    getCollection(Collections.LEASES)
      .where("status", "==", LeaseStatus.COMPLETED)
      .count()
      .get(),
    getCollection(Collections.LEASES)
      .where("status", "==", LeaseStatus.LOST)
      .count()
      .get(),
  ]);

  // Get total savings
  const completedDocs = await getCollection(Collections.LEASES)
    .where("status", "==", LeaseStatus.COMPLETED)
    .select("savingsUsd")
    .get();

  const totalSavingsUsd = completedDocs.docs.reduce(
    (sum, doc) => sum + ((doc.data().savingsUsd as number) || 0),
    0
  );

  return {
    active: active.data().count,
    pending: pending.data().count,
    completed: completed.data().count,
    lost: lost.data().count,
    totalSavingsUsd,
  };
}

/**
 * Get leases grouped by tenant for usage breakdown.
 */
export async function getLeasesByTenant(): Promise<
  Array<{
    tenantId: string;
    activeLeases: number;
    totalLeases: number;
    totalSavingsUsd: number;
    totalBillableSeconds: number;
  }>
> {
  const snapshot = await getCollection(Collections.LEASES).get();

  const tenantMap = new Map<
    string,
    {
      tenantId: string;
      activeLeases: number;
      totalLeases: number;
      totalSavingsUsd: number;
      totalBillableSeconds: number;
    }
  >();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const tenantId = (data.tenantId as string) || "unknown";

    if (!tenantMap.has(tenantId)) {
      tenantMap.set(tenantId, {
        tenantId,
        activeLeases: 0,
        totalLeases: 0,
        totalSavingsUsd: 0,
        totalBillableSeconds: 0,
      });
    }

    const entry = tenantMap.get(tenantId)!;
    entry.totalLeases++;

    if (
      data.status === LeaseStatus.ACTIVE ||
      data.status === LeaseStatus.NEGOTIATING
    ) {
      entry.activeLeases++;
    }

    entry.totalSavingsUsd += (data.savingsUsd as number) || 0;
    entry.totalBillableSeconds += (data.billableSeconds as number) || 0;
  }

  return Array.from(tenantMap.values()).sort(
    (a, b) => b.totalSavingsUsd - a.totalSavingsUsd
  );
}

/**
 * Get cost analytics - savings by time period.
 */
export async function getCostAnalytics(): Promise<{
  hourly: Array<{ hour: string; savingsUsd: number; leaseCount: number }>;
  daily: Array<{ date: string; savingsUsd: number; leaseCount: number }>;
  totalBaselineCostUsd: number;
  totalActualCostUsd: number;
  totalSavingsUsd: number;
}> {
  const snapshot = await getCollection(Collections.LEASES)
    .where("status", "==", LeaseStatus.COMPLETED)
    .get();

  const hourlyMap = new Map<string, { savingsUsd: number; leaseCount: number }>();
  const dailyMap = new Map<string, { savingsUsd: number; leaseCount: number }>();

  let totalBaselineCostUsd = 0;
  let totalActualCostUsd = 0;
  let totalSavingsUsd = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const releasedAt = data.releasedAt?.toDate?.() ?? new Date(data.releasedAt as string);

    if (!releasedAt) continue;

    // Hourly bucket (last 24 hours)
    const hourKey = releasedAt.toISOString().slice(0, 13) + ":00";
    const dayKey = releasedAt.toISOString().slice(0, 10);

    const savings = (data.savingsUsd as number) || 0;
    const baseline = (data.baselineCostUsd as number) || 0;
    const actual = (data.actualCostUsd as number) || 0;

    totalBaselineCostUsd += baseline;
    totalActualCostUsd += actual;
    totalSavingsUsd += savings;

    // Update hourly
    if (!hourlyMap.has(hourKey)) {
      hourlyMap.set(hourKey, { savingsUsd: 0, leaseCount: 0 });
    }
    const hourEntry = hourlyMap.get(hourKey)!;
    hourEntry.savingsUsd += savings;
    hourEntry.leaseCount++;

    // Update daily
    if (!dailyMap.has(dayKey)) {
      dailyMap.set(dayKey, { savingsUsd: 0, leaseCount: 0 });
    }
    const dayEntry = dailyMap.get(dayKey)!;
    dayEntry.savingsUsd += savings;
    dayEntry.leaseCount++;
  }

  // Sort and return last 24 hours / 7 days
  const hourly = Array.from(hourlyMap.entries())
    .map(([hour, data]) => ({ hour, ...data }))
    .sort((a, b) => a.hour.localeCompare(b.hour))
    .slice(-24);

  const daily = Array.from(dailyMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);

  return {
    hourly,
    daily,
    totalBaselineCostUsd,
    totalActualCostUsd,
    totalSavingsUsd,
  };
}
