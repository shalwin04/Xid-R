/**
 * Preemption Listener
 *
 * Detects preemption events from various sources and triggers the Negotiator.
 *
 * Sources:
 * - Spot VM metadata server (polls for preemption notice)
 * - Manual API trigger (for testing and admin control)
 * - GKE node events via Pub/Sub (future)
 * - Utilization spikes from Cloud Monitoring (future)
 */

import { EventEmitter } from "eventemitter3";

import { getConfig } from "../config.js";
import { createLogger } from "../utils/logger.js";
import { getNegotiator, ReclaimRequest } from "../agents/negotiator.js";
import { getAllCapacityUnits, getCapacityUnit } from "../db/capacity.js";
import { getActiveLeaseForCapacity } from "../db/leases.js";
import { recordAuditEvent } from "../db/audit.js";
import { EventType, EventSource } from "../models/audit.js";
import { CapacityStatus, CapacityType } from "../models/capacity.js";
import { initFirestore } from "../db/firestore.js";

const log = createLogger({ module: "preemption-listener" });

export interface PreemptionEvent {
  capacityUnitId: string;
  reason: ReclaimRequest["reason"];
  graceMs: number;
  source: "spot_metadata" | "manual" | "pubsub" | "utilization";
  detectedAt: Date;
}

export interface PreemptionListenerEvents {
  preemptionDetected: (event: PreemptionEvent) => void;
  reclaimTriggered: (capacityUnitId: string) => void;
  reclaimCompleted: (capacityUnitId: string, success: boolean) => void;
}

/**
 * Spot VM metadata server response for preemption.
 */
interface SpotPreemptionMetadata {
  preempted: boolean;
  terminateTime?: string;
}

export class PreemptionListener extends EventEmitter<PreemptionListenerEvents> {
  private config = getConfig();
  private running = false;
  private pollHandle: NodeJS.Timeout | null = null;
  private pendingReclaims = new Set<string>();

  // Track which capacity units are Spot VMs (need metadata polling)
  private spotCapacityUnits = new Map<string, {
    instanceName: string;
    zone: string;
    lastChecked: Date;
  }>();

  /**
   * Start the preemption listener.
   */
  start(): void {
    if (this.running) {
      log.warn("Preemption listener already running");
      return;
    }

    this.running = true;
    log.info("Preemption listener started");

    // Initial discovery of Spot VMs
    this.discoverSpotVMs();

    // Poll Spot VM metadata every 5 seconds
    this.pollHandle = setInterval(
      () => this.pollSpotMetadata(),
      5000
    );
  }

  /**
   * Stop the preemption listener.
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    log.info("Preemption listener stopped");
  }

  /**
   * Discover Spot VMs from capacity units.
   */
  private async discoverSpotVMs(): Promise<void> {
    try {
      const units = await getAllCapacityUnits();

      for (const unit of units) {
        if (unit.type === CapacityType.SPOT_VM && unit.instanceName) {
          this.spotCapacityUnits.set(unit.id, {
            instanceName: unit.instanceName,
            zone: unit.zone,
            lastChecked: new Date(0),
          });
        }
      }

      log.info("Discovered Spot VMs for monitoring", {
        count: this.spotCapacityUnits.size
      });
    } catch (error) {
      log.error("Failed to discover Spot VMs", {
        error: (error as Error).message
      });
    }
  }

  /**
   * Poll Spot VM metadata server for preemption notices.
   *
   * In production, this would make HTTP requests to the metadata server:
   * http://metadata.google.internal/computeMetadata/v1/instance/preempted
   *
   * For development/testing, we skip actual polling and rely on manual triggers.
   */
  private async pollSpotMetadata(): Promise<void> {
    if (this.spotCapacityUnits.size === 0) {
      return;
    }

    for (const [unitId, info] of this.spotCapacityUnits) {
      // Skip if already being reclaimed
      if (this.pendingReclaims.has(unitId)) {
        continue;
      }

      try {
        const preempted = await this.checkSpotPreemption(unitId, info.instanceName);

        if (preempted) {
          log.info("Spot preemption detected via metadata", {
            capacityUnitId: unitId,
            instanceName: info.instanceName
          });

          await this.handlePreemption({
            capacityUnitId: unitId,
            reason: "spot_preemption",
            graceMs: this.config.capacity.spotPreemptionGraceMs,
            source: "spot_metadata",
            detectedAt: new Date(),
          });
        }

        info.lastChecked = new Date();
      } catch (error) {
        log.debug("Failed to check Spot metadata", {
          unitId,
          error: (error as Error).message
        });
      }
    }
  }

  /**
   * Check if a Spot VM has been preempted.
   *
   * In production, this queries the GCP metadata server.
   * Returns false in development mode.
   */
  private async checkSpotPreemption(
    _unitId: string,
    instanceName: string
  ): Promise<boolean> {
    // In development, don't poll real metadata server
    if (this.config.environment === "development") {
      return false;
    }

    try {
      // Query the metadata server from within the VM
      // This only works when running ON the actual Spot VM
      const response = await fetch(
        "http://metadata.google.internal/computeMetadata/v1/instance/preempted",
        {
          headers: {
            "Metadata-Flavor": "Google",
          },
          signal: AbortSignal.timeout(2000),
        }
      );

      if (!response.ok) {
        return false;
      }

      const text = await response.text();
      return text.toLowerCase() === "true";
    } catch {
      // Metadata server not available (not running on GCP)
      return false;
    }
  }

  /**
   * Manually trigger a preemption for a capacity unit.
   * Used for testing and admin control.
   */
  async triggerManualReclaim(
    capacityUnitId: string,
    reason: ReclaimRequest["reason"] = "manual",
    graceMs?: number
  ): Promise<{ success: boolean; error?: string }> {
    log.info("Manual reclaim triggered", { capacityUnitId, reason });

    // Verify capacity unit exists
    const unit = await getCapacityUnit(capacityUnitId);
    if (!unit) {
      return { success: false, error: "Capacity unit not found" };
    }

    // Check if already being reclaimed
    if (this.pendingReclaims.has(capacityUnitId)) {
      return { success: false, error: "Reclaim already in progress" };
    }

    // Check if there's an active lease
    const lease = await getActiveLeaseForCapacity(capacityUnitId);
    if (!lease) {
      return { success: false, error: "No active lease on this capacity" };
    }

    // Determine grace period
    const effectiveGraceMs = graceMs ?? (
      reason === "spot_preemption"
        ? this.config.capacity.spotPreemptionGraceMs
        : this.config.capacity.mpsReclaimGraceMs
    );

    await this.handlePreemption({
      capacityUnitId,
      reason,
      graceMs: effectiveGraceMs,
      source: "manual",
      detectedAt: new Date(),
    });

    return { success: true };
  }

  /**
   * Handle a preemption event by triggering the Negotiator.
   */
  private async handlePreemption(event: PreemptionEvent): Promise<void> {
    const { capacityUnitId, reason, graceMs, source } = event;

    // Mark as pending to avoid duplicate triggers
    this.pendingReclaims.add(capacityUnitId);

    this.emit("preemptionDetected", event);

    // Record audit event
    await recordAuditEvent({
      eventType: EventType.RECLAIM_INITIATED,
      source: EventSource.CAPACITY_FABRIC,
      capacityUnitId,
      details: {
        reason,
        graceMs,
        triggerSource: source,
      },
      reasoning: `Preemption detected from ${source}: ${reason}`,
      decisionFactors: [source, reason, `grace_period:${graceMs}ms`],
    });

    try {
      // Get the Negotiator and initiate reclaim
      const negotiator = getNegotiator();

      this.emit("reclaimTriggered", capacityUnitId);

      const success = await negotiator.initiateReclaim(
        capacityUnitId,
        reason,
        graceMs
      );

      this.emit("reclaimCompleted", capacityUnitId, success);

      log.info("Reclaim completed", { capacityUnitId, success });
    } catch (error) {
      log.error("Reclaim failed", {
        capacityUnitId,
        error: (error as Error).message
      });
      this.emit("reclaimCompleted", capacityUnitId, false);
    } finally {
      this.pendingReclaims.delete(capacityUnitId);
    }
  }

  /**
   * Simulate a utilization spike on a capacity unit.
   * This would normally come from Cloud Monitoring alerts.
   */
  async triggerUtilizationSpike(
    capacityUnitId: string,
    utilizationPercent: number
  ): Promise<{ success: boolean; error?: string }> {
    log.info("Utilization spike detected", { capacityUnitId, utilizationPercent });

    const unit = await getCapacityUnit(capacityUnitId);
    if (!unit) {
      return { success: false, error: "Capacity unit not found" };
    }

    // Only reclaim harvestable capacity (idle GPU being used by Xid-R tenant)
    if (unit.status !== CapacityStatus.LEASED) {
      return { success: false, error: "Capacity not currently leased" };
    }

    await this.handlePreemption({
      capacityUnitId,
      reason: "utilization_spike",
      graceMs: this.config.capacity.mpsReclaimGraceMs,
      source: "utilization",
      detectedAt: new Date(),
    });

    return { success: true };
  }

  /**
   * Register a new Spot VM for monitoring.
   */
  registerSpotVM(capacityUnitId: string, instanceName: string, zone: string): void {
    this.spotCapacityUnits.set(capacityUnitId, {
      instanceName,
      zone,
      lastChecked: new Date(0),
    });
    log.info("Registered Spot VM for preemption monitoring", {
      capacityUnitId,
      instanceName
    });
  }

  /**
   * Unregister a Spot VM from monitoring.
   */
  unregisterSpotVM(capacityUnitId: string): void {
    this.spotCapacityUnits.delete(capacityUnitId);
    log.info("Unregistered Spot VM from monitoring", { capacityUnitId });
  }

  /**
   * Get current monitoring status.
   */
  getStatus(): {
    running: boolean;
    spotVMsMonitored: number;
    pendingReclaims: number;
  } {
    return {
      running: this.running,
      spotVMsMonitored: this.spotCapacityUnits.size,
      pendingReclaims: this.pendingReclaims.size,
    };
  }
}

// Singleton instance
let listener: PreemptionListener | null = null;

export function getPreemptionListener(): PreemptionListener {
  if (!listener) {
    listener = new PreemptionListener();
  }
  return listener;
}

// Main entry point
export async function run(): Promise<void> {
  log.info("Starting Preemption Listener");

  // Initialize Firestore
  initFirestore();

  const preemptionListener = getPreemptionListener();

  // Handle shutdown
  process.on("SIGINT", () => {
    log.info("Received SIGINT, shutting down");
    preemptionListener.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    log.info("Received SIGTERM, shutting down");
    preemptionListener.stop();
    process.exit(0);
  });

  // Start listener
  preemptionListener.start();

  // Keep process alive
  await new Promise(() => {});
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    log.error("Preemption listener failed", { error: err.message });
    process.exit(1);
  });
}
