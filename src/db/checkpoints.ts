/**
 * Checkpoint collection operations.
 */

import {
  Checkpoint,
  CheckpointStatus,
  CreateCheckpointInput,
  createCheckpoint,
  checkpointFromFirestore,
} from "../models/checkpoint.js";
import { generateCheckpointId } from "../utils/ids.js";
import { createLogger } from "../utils/logger.js";
import { getCollection, Collections } from "./firestore.js";

const logger = createLogger({ module: "db:checkpoints" });

/**
 * Record a new checkpoint.
 */
export async function recordCheckpoint(input: CreateCheckpointInput): Promise<Checkpoint> {
  const id = generateCheckpointId(input.leaseId);
  const checkpoint = createCheckpoint(input);

  await getCollection(Collections.CHECKPOINTS).doc(id).set(checkpoint);
  logger.info("Recorded checkpoint", {
    checkpointId: id,
    leaseId: input.leaseId,
    sizeBytes: input.sizeBytes,
  });

  return { id, ...checkpoint };
}

/**
 * Get a checkpoint by ID.
 */
export async function getCheckpoint(id: string): Promise<Checkpoint | null> {
  const doc = await getCollection(Collections.CHECKPOINTS).doc(id).get();
  if (!doc.exists) return null;
  return checkpointFromFirestore(doc.id, doc.data() as Record<string, unknown>);
}

/**
 * Get checkpoints for a lease.
 */
export async function getCheckpointsForLease(leaseId: string): Promise<Checkpoint[]> {
  const snapshot = await getCollection(Collections.CHECKPOINTS)
    .where("leaseId", "==", leaseId)
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) =>
    checkpointFromFirestore(doc.id, doc.data() as Record<string, unknown>)
  );
}

/**
 * Get the latest checkpoint for a lease.
 */
export async function getLatestCheckpoint(leaseId: string): Promise<Checkpoint | null> {
  const snapshot = await getCollection(Collections.CHECKPOINTS)
    .where("leaseId", "==", leaseId)
    .where("status", "==", CheckpointStatus.COMPLETE)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return checkpointFromFirestore(doc.id, doc.data() as Record<string, unknown>);
}

/**
 * Mark a checkpoint as restored.
 */
export async function markCheckpointRestored(
  checkpointId: string,
  newLeaseId: string
): Promise<Checkpoint | null> {
  const ref = getCollection(Collections.CHECKPOINTS).doc(checkpointId);

  await ref.update({
    status: CheckpointStatus.RESTORED,
    restoredToLeaseId: newLeaseId,
  });

  const doc = await ref.get();
  if (!doc.exists) return null;
  return checkpointFromFirestore(doc.id, doc.data() as Record<string, unknown>);
}

/**
 * Mark a checkpoint as failed.
 */
export async function markCheckpointFailed(
  checkpointId: string,
  error: string
): Promise<Checkpoint | null> {
  const ref = getCollection(Collections.CHECKPOINTS).doc(checkpointId);

  await ref.update({
    status: CheckpointStatus.FAILED,
    error,
  });

  const doc = await ref.get();
  if (!doc.exists) return null;
  return checkpointFromFirestore(doc.id, doc.data() as Record<string, unknown>);
}

/**
 * Get checkpoints for an agent.
 */
export async function getCheckpointsForAgent(agentId: string): Promise<Checkpoint[]> {
  const snapshot = await getCollection(Collections.CHECKPOINTS)
    .where("agentId", "==", agentId)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  return snapshot.docs.map((doc) =>
    checkpointFromFirestore(doc.id, doc.data() as Record<string, unknown>)
  );
}

/**
 * Clean up expired checkpoints.
 */
export async function cleanupExpiredCheckpoints(): Promise<number> {
  const now = new Date();
  const snapshot = await getCollection(Collections.CHECKPOINTS)
    .where("expiresAt", "<", now)
    .where("status", "==", CheckpointStatus.COMPLETE)
    .get();

  const batch = getCollection(Collections.CHECKPOINTS).firestore.batch();

  for (const doc of snapshot.docs) {
    batch.update(doc.ref, { status: CheckpointStatus.EXPIRED });
  }

  await batch.commit();

  if (snapshot.docs.length > 0) {
    logger.info("Expired checkpoints", { count: snapshot.docs.length });
  }

  return snapshot.docs.length;
}

/**
 * Get checkpoint statistics.
 */
export async function getCheckpointStats(): Promise<{
  total: number;
  complete: number;
  restored: number;
  failed: number;
  totalSizeBytes: number;
  avgDurationMs: number;
}> {
  const snapshot = await getCollection(Collections.CHECKPOINTS).get();

  let complete = 0;
  let restored = 0;
  let failed = 0;
  let totalSizeBytes = 0;
  let totalDurationMs = 0;
  let durationCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.status === CheckpointStatus.COMPLETE) complete++;
    else if (data.status === CheckpointStatus.RESTORED) restored++;
    else if (data.status === CheckpointStatus.FAILED) failed++;

    totalSizeBytes += (data.sizeBytes as number) || 0;
    if (data.durationMs) {
      totalDurationMs += data.durationMs as number;
      durationCount++;
    }
  }

  return {
    total: snapshot.docs.length,
    complete,
    restored,
    failed,
    totalSizeBytes,
    avgDurationMs: durationCount > 0 ? Math.round(totalDurationMs / durationCount) : 0,
  };
}

/**
 * Get detailed checkpoint analytics.
 */
export async function getCheckpointAnalytics(): Promise<{
  total: number;
  complete: number;
  restored: number;
  failed: number;
  expired: number;
  totalSizeBytes: number;
  avgSizeBytes: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  successRate: number;
  recentCheckpoints: Array<{
    id: string;
    leaseId: string;
    status: string;
    sizeBytes: number;
    durationMs: number;
    createdAt: string;
  }>;
}> {
  const snapshot = await getCollection(Collections.CHECKPOINTS)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  let complete = 0;
  let restored = 0;
  let failed = 0;
  let expired = 0;
  let totalSizeBytes = 0;
  let totalDurationMs = 0;
  let durationCount = 0;
  let minDurationMs = Infinity;
  let maxDurationMs = 0;

  const recentCheckpoints: Array<{
    id: string;
    leaseId: string;
    status: string;
    sizeBytes: number;
    durationMs: number;
    createdAt: string;
  }> = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const status = data.status as string;

    if (status === CheckpointStatus.COMPLETE) complete++;
    else if (status === CheckpointStatus.RESTORED) restored++;
    else if (status === CheckpointStatus.FAILED) failed++;
    else if (status === CheckpointStatus.EXPIRED) expired++;

    const sizeBytes = (data.sizeBytes as number) || 0;
    const durationMs = (data.durationMs as number) || 0;

    totalSizeBytes += sizeBytes;

    if (durationMs > 0) {
      totalDurationMs += durationMs;
      durationCount++;
      minDurationMs = Math.min(minDurationMs, durationMs);
      maxDurationMs = Math.max(maxDurationMs, durationMs);
    }

    // Add to recent list (top 10)
    if (recentCheckpoints.length < 10) {
      const createdAt = data.createdAt?.toDate?.() ?? new Date(data.createdAt as string);
      recentCheckpoints.push({
        id: doc.id,
        leaseId: data.leaseId as string,
        status,
        sizeBytes,
        durationMs,
        createdAt: createdAt.toISOString(),
      });
    }
  }

  const total = snapshot.docs.length;
  const successfulCount = complete + restored;
  const successRate = total > 0 ? (successfulCount / total) * 100 : 0;

  return {
    total,
    complete,
    restored,
    failed,
    expired,
    totalSizeBytes,
    avgSizeBytes: total > 0 ? Math.round(totalSizeBytes / total) : 0,
    avgDurationMs: durationCount > 0 ? Math.round(totalDurationMs / durationCount) : 0,
    minDurationMs: minDurationMs === Infinity ? 0 : minDurationMs,
    maxDurationMs,
    successRate: Math.round(successRate * 100) / 100,
    recentCheckpoints,
  };
}
