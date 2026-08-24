/**
 * Spot VM Preemption Handler
 *
 * Monitors GCP metadata server for preemption notices and triggers
 * the Negotiator agent to handle graceful eviction.
 */

import { EventEmitter } from "eventemitter3";

import { getConfig } from "../config.js";
import { createLogger } from "../utils/logger.js";
import { getNegotiator } from "../agents/negotiator.js";
import { getAllCapacityUnits } from "../db/capacity.js";
import { CapacityType } from "../models/capacity.js";

const log = createLogger({ module: "preemption" });

// GCP Metadata server endpoint for preemption notice
const METADATA_URL = "http://metadata.google.internal/computeMetadata/v1/instance/preempted";
const MAINTENANCE_URL = "http://metadata.google.internal/computeMetadata/v1/instance/maintenance-event";

export interface PreemptionEvents {
  preemptionDetected: (instanceName: string, graceMs: number) => void;
  maintenanceDetected: (instanceName: string) => void;
  handlerError: (error: Error) => void;
}

export class PreemptionHandler extends EventEmitter<PreemptionEvents> {
  private config = getConfig();
  private running = false;
  private pollHandle: NodeJS.Timeout | null = null;
  private instanceName: string | null = null;

  /**
   * Start monitoring for preemption notices.
   *
   * When running on a Spot VM, this will poll the metadata server.
   * When running elsewhere, this is a no-op.
   */
  async start(instanceName?: string): Promise<void> {
    if (this.running) {
      log.warn("Preemption handler already running");
      return;
    }

    // Detect if we're running on GCP
    const isGCP = await this.detectGCP();

    if (!isGCP && !instanceName) {
      log.info("Not running on GCP, preemption handler disabled");
      return;
    }

    this.instanceName = instanceName ?? (await this.getInstanceName());
    this.running = true;

    log.info("Preemption handler started", { instanceName: this.instanceName });

    // Poll metadata server
    this.pollHandle = setInterval(() => this.checkPreemption(), 5000);
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    log.info("Preemption handler stopped");
  }

  /**
   * Detect if running on GCP by checking metadata server.
   */
  private async detectGCP(): Promise<boolean> {
    try {
      const response = await fetch("http://metadata.google.internal/", {
        headers: { "Metadata-Flavor": "Google" },
        signal: AbortSignal.timeout(1000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get instance name from metadata server.
   */
  private async getInstanceName(): Promise<string> {
    try {
      const response = await fetch(
        "http://metadata.google.internal/computeMetadata/v1/instance/name",
        {
          headers: { "Metadata-Flavor": "Google" },
        }
      );
      return await response.text();
    } catch (error) {
      log.error("Failed to get instance name", { error: (error as Error).message });
      return "unknown";
    }
  }

  /**
   * Check for preemption notice from metadata server.
   */
  private async checkPreemption(): Promise<void> {
    try {
      // Check preemption status
      const preemptResponse = await fetch(METADATA_URL, {
        headers: { "Metadata-Flavor": "Google" },
        signal: AbortSignal.timeout(2000),
      });

      if (preemptResponse.ok) {
        const preempted = (await preemptResponse.text()).toLowerCase() === "true";

        if (preempted) {
          await this.handlePreemption();
        }
      }

      // Check maintenance event
      const maintenanceResponse = await fetch(MAINTENANCE_URL, {
        headers: { "Metadata-Flavor": "Google" },
        signal: AbortSignal.timeout(2000),
      });

      if (maintenanceResponse.ok) {
        const event = await maintenanceResponse.text();

        if (event && event !== "NONE") {
          await this.handleMaintenance(event);
        }
      }
    } catch (error) {
      // Metadata server errors are expected when not on GCP
      // or when the endpoint doesn't exist
      if ((error as Error).name !== "AbortError") {
        log.debug("Metadata check failed", { error: (error as Error).message });
      }
    }
  }

  /**
   * Handle preemption notice.
   */
  private async handlePreemption(): Promise<void> {
    log.warn("PREEMPTION DETECTED", { instanceName: this.instanceName });

    const graceMs = this.config.capacity.spotPreemptionGraceMs;
    this.emit("preemptionDetected", this.instanceName ?? "unknown", graceMs);

    // Find capacity unit for this instance
    const capacityUnitId = await this.findCapacityUnitId();

    if (capacityUnitId) {
      // Trigger negotiation
      const negotiator = getNegotiator();
      await negotiator.initiateReclaim(capacityUnitId, "spot_preemption", graceMs);
    }

    // Stop polling after preemption detected
    this.stop();
  }

  /**
   * Handle maintenance event.
   */
  private async handleMaintenance(event: string): Promise<void> {
    log.warn("MAINTENANCE EVENT DETECTED", { instanceName: this.instanceName, event });
    this.emit("maintenanceDetected", this.instanceName ?? "unknown");

    // Similar handling to preemption
    const capacityUnitId = await this.findCapacityUnitId();

    if (capacityUnitId) {
      const negotiator = getNegotiator();
      await negotiator.initiateReclaim(capacityUnitId, "maintenance");
    }
  }

  /**
   * Find capacity unit ID for current instance.
   */
  private async findCapacityUnitId(): Promise<string | null> {
    if (!this.instanceName) return null;

    const units = await getAllCapacityUnits();
    const unit = units.find(
      (u) => u.instanceName === this.instanceName && u.type === CapacityType.SPOT_VM
    );

    return unit?.id ?? null;
  }

  /**
   * Simulate preemption for testing/demos.
   */
  async simulatePreemption(capacityUnitId: string): Promise<void> {
    log.info("Simulating preemption", { capacityUnitId });

    this.emit("preemptionDetected", capacityUnitId, this.config.capacity.spotPreemptionGraceMs);

    const negotiator = getNegotiator();
    await negotiator.initiateReclaim(
      capacityUnitId,
      "spot_preemption",
      this.config.capacity.spotPreemptionGraceMs
    );
  }
}

// Singleton instance
let handler: PreemptionHandler | null = null;

export function getPreemptionHandler(): PreemptionHandler {
  if (!handler) {
    handler = new PreemptionHandler();
  }
  return handler;
}

/**
 * Start preemption monitoring if running on a Spot VM.
 */
export async function startPreemptionMonitoring(): Promise<PreemptionHandler> {
  const preemptionHandler = getPreemptionHandler();
  await preemptionHandler.start();
  return preemptionHandler;
}
