/**
 * Scheduler Agent
 *
 * Matches GPU requests to available capacity using rule-based matching.
 * For MVP, uses simple priority + FIFO ordering.
 */

import { EventEmitter } from "eventemitter3";

import { getConfig } from "../config.js";
import { createLogger } from "../utils/logger.js";
import {
  getPendingLeases,
  grantLease,
  updateLease,
} from "../db/leases.js";
import {
  getAvailableCapacity,
  reserveCapacity,
} from "../db/capacity.js";
import { recordAuditEvent } from "../db/audit.js";
import { EventType, EventSource } from "../models/audit.js";
import { LeaseStatus } from "../models/lease.js";
import { CapacityUnit, getCapacityLane } from "../models/capacity.js";
import { initFirestore } from "../db/firestore.js";

const log = createLogger({ module: "scheduler" });

export interface SchedulerEvents {
  leaseGranted: (leaseId: string, capacityUnitId: string) => void;
  leaseDenied: (leaseId: string, reason: string) => void;
  cycleComplete: (processed: number, granted: number) => void;
}

export class SchedulerAgent extends EventEmitter<SchedulerEvents> {
  private config = getConfig();
  private running = false;
  private intervalHandle: NodeJS.Timeout | null = null;

  /**
   * Start the scheduler loop.
   */
  start(intervalMs: number = 5000): void {
    if (this.running) {
      log.warn("Scheduler already running");
      return;
    }

    this.running = true;
    log.info("Scheduler started", { intervalMs });

    // Run immediately, then on interval
    this.runCycle();
    this.intervalHandle = setInterval(() => this.runCycle(), intervalMs);
  }

  /**
   * Stop the scheduler loop.
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    log.info("Scheduler stopped");
  }

  /**
   * Run a single scheduling cycle.
   */
  async runCycle(): Promise<{ processed: number; granted: number }> {
    const startTime = Date.now();
    let processed = 0;
    let granted = 0;

    try {
      // Get pending leases ordered by priority + time
      const pendingLeases = await getPendingLeases();

      if (pendingLeases.length === 0) {
        return { processed: 0, granted: 0 };
      }

      log.debug("Processing pending leases", { count: pendingLeases.length });

      for (const lease of pendingLeases) {
        processed++;

        // Find available capacity for this GPU type
        const availableUnits = await getAvailableCapacity(lease.gpuType);

        if (availableUnits.length === 0) {
          log.debug("No capacity for lease", { leaseId: lease.id, gpuType: lease.gpuType });
          continue;
        }

        // Select best capacity unit
        const selectedUnit = this.selectCapacityUnit(availableUnits, lease.priority);

        if (!selectedUnit) {
          continue;
        }

        // Grant the lease
        const success = await this.grantLeaseToCapacity(lease.id, selectedUnit);

        if (success) {
          granted++;
          this.emit("leaseGranted", lease.id, selectedUnit.id);
        }
      }

      const duration = Date.now() - startTime;
      log.info("Scheduling cycle complete", { processed, granted, durationMs: duration });
      this.emit("cycleComplete", processed, granted);

      return { processed, granted };
    } catch (error) {
      log.error("Scheduling cycle failed", { error: (error as Error).message });
      return { processed, granted };
    }
  }

  /**
   * Select the best capacity unit for a request.
   *
   * Selection criteria (MVP - rule-based):
   * 1. Prefer lower utilization (more idle = better)
   * 2. Prefer longer preemption grace period for high priority
   * 3. Prefer dedicated isolation for external agents
   */
  private selectCapacityUnit(
    units: CapacityUnit[],
    priority: string
  ): CapacityUnit | null {
    if (units.length === 0) return null;

    // Sort by selection criteria
    const sorted = [...units].sort((a, b) => {
      // Lower utilization first
      const utilDiff = a.utilizationPercent - b.utilizationPercent;
      if (Math.abs(utilDiff) > 5) return utilDiff;

      // For high priority, prefer longer grace period
      if (priority === "high") {
        return b.preemptionGraceMs - a.preemptionGraceMs;
      }

      // Default: prefer shorter grace period (Spot VMs are cheaper)
      return a.preemptionGraceMs - b.preemptionGraceMs;
    });

    return sorted[0];
  }

  /**
   * Grant a lease to a specific capacity unit.
   */
  private async grantLeaseToCapacity(
    leaseId: string,
    unit: CapacityUnit
  ): Promise<boolean> {
    try {
      // Reserve the capacity
      await reserveCapacity(unit.id, leaseId);

      // Update the lease
      const capacityLane = getCapacityLane(unit);
      const checkpointTargetUri = `gs://${this.config.gcp.checkpointBucket}/${leaseId}/`;

      await grantLease(
        leaseId,
        unit.id,
        capacityLane,
        {
          host: unit.instanceName ?? `${unit.clusterName}-${unit.nodePool}`,
          port: 8080,
          gpuDevice: `/dev/nvidia${unit.gpuIndex}`,
        },
        Math.floor(unit.preemptionGraceMs / 1000),
        this.config.gcp.checkpointBucket
      );

      // Record audit event
      await recordAuditEvent({
        eventType: EventType.LEASE_GRANTED,
        source: EventSource.SCHEDULER,
        leaseId,
        capacityUnitId: unit.id,
        details: {
          capacityLane,
          gpuType: unit.gpuType,
          utilizationPercent: unit.utilizationPercent,
          preemptionGraceMs: unit.preemptionGraceMs,
        },
        reasoning: `Matched to ${capacityLane} capacity with ${unit.utilizationPercent}% utilization`,
        decisionFactors: [
          `gpu_type:${unit.gpuType}`,
          `utilization:${unit.utilizationPercent}%`,
          `lane:${capacityLane}`,
          "availability",
        ],
      });

      log.info("Lease granted", { leaseId, capacityUnitId: unit.id, capacityLane });
      return true;
    } catch (error) {
      log.error("Failed to grant lease", {
        leaseId,
        capacityUnitId: unit.id,
        error: (error as Error).message,
      });

      // Record denial
      await recordAuditEvent({
        eventType: EventType.LEASE_DENIED,
        source: EventSource.SCHEDULER,
        leaseId,
        capacityUnitId: unit.id,
        details: { error: (error as Error).message },
        reasoning: `Grant failed: ${(error as Error).message}`,
        decisionFactors: ["grant_error"],
      });

      return false;
    }
  }
}

// Main entry point
export async function run(): Promise<void> {
  log.info("Starting Scheduler Agent");

  // Initialize Firestore
  initFirestore();

  const scheduler = new SchedulerAgent();

  // Handle shutdown
  process.on("SIGINT", () => {
    log.info("Received SIGINT, shutting down");
    scheduler.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    log.info("Received SIGTERM, shutting down");
    scheduler.stop();
    process.exit(0);
  });

  // Start scheduler
  scheduler.start(5000);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    log.error("Scheduler failed", { error: err.message });
    process.exit(1);
  });
}
