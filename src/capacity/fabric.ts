/**
 * Capacity Fabric
 *
 * Discovers and tracks GPU capacity from:
 * - GKE node pools with GPUs
 * - Spot VMs
 * - Cloud Run GPU workers
 *
 * Monitors utilization and marks idle capacity as harvestable.
 */

import { EventEmitter } from "eventemitter3";

import { getConfig } from "../config.js";
import { createLogger } from "../utils/logger.js";
import {
  upsertCapacityUnit,
  getAllCapacityUnits,
  updateUtilization,
  getHarvestableCapacity,
  updateCapacityUnit,
  deleteCapacityUnit,
} from "../db/capacity.js";
import { recordAuditEvent } from "../db/audit.js";
import { EventType, EventSource } from "../models/audit.js";
import { CapacityStatus, CapacityType, TrustTier, IsolationMode } from "../models/capacity.js";
import { initFirestore } from "../db/firestore.js";
import { getGKEDiscovery } from "./gke-discovery.js";

const log = createLogger({ module: "capacity-fabric" });

// Enable real GKE discovery via environment variable
const USE_REAL_GKE = process.env.USE_REAL_GKE === "true";

export interface CapacityFabricEvents {
  capacityDiscovered: (unitId: string, gpuType: string) => void;
  capacityMarkedHarvestable: (unitId: string) => void;
  capacityRemoved: (unitId: string) => void;
  utilizationUpdated: (unitId: string, percent: number) => void;
}

/**
 * Simulated GPU instance for demo/development.
 */
interface SimulatedInstance {
  id: string;
  name: string;
  zone: string;
  gpuType: string;
  memoryGb: number;
  type: CapacityType;
  hourlyRate: number;
}

export class CapacityFabric extends EventEmitter<CapacityFabricEvents> {
  private config = getConfig();
  private running = false;
  private pollHandle: NodeJS.Timeout | null = null;
  private harvestHandle: NodeJS.Timeout | null = null;

  // For demo: track simulated instances
  private simulatedInstances: Map<string, SimulatedInstance> = new Map();

  /**
   * Start the capacity fabric.
   */
  start(): void {
    if (this.running) {
      log.warn("Capacity fabric already running");
      return;
    }

    this.running = true;
    log.info("Capacity fabric started");

    // Initial discovery
    this.discoverCapacity();

    // Periodic polling for utilization
    this.pollHandle = setInterval(
      () => this.pollUtilization(),
      this.config.capacity.utilizationPollIntervalMs
    );

    // Check for harvestable capacity
    this.harvestHandle = setInterval(
      () => this.checkHarvestable(),
      60000 // Every minute
    );
  }

  /**
   * Stop the capacity fabric.
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    if (this.harvestHandle) {
      clearInterval(this.harvestHandle);
      this.harvestHandle = null;
    }
    log.info("Capacity fabric stopped");
  }

  /**
   * Discover available GPU capacity.
   *
   * In production, this would query:
   * - GKE API for node pools
   * - Compute Engine for Spot VMs
   * - Cloud Monitoring for current state
   *
   * For MVP/demo, we use simulated instances.
   */
  async discoverCapacity(): Promise<void> {
    log.info("Discovering capacity", { useRealGKE: USE_REAL_GKE });

    try {
      if (USE_REAL_GKE) {
        // Use real GKE discovery
        const gkeDiscovery = getGKEDiscovery();
        await gkeDiscovery.discoverNodes();
        log.info("Real GKE capacity discovery complete");
      } else {
        // For demo: create simulated capacity if none exists
        const existing = await getAllCapacityUnits();

        if (existing.length === 0) {
          await this.seedDemoCapacity();
        }

        log.info("Demo capacity discovery complete", { units: existing.length });
      }
    } catch (error) {
      log.error("Capacity discovery failed", { error: (error as Error).message });

      // Fall back to demo capacity if real discovery fails
      if (USE_REAL_GKE) {
        log.warn("Falling back to demo capacity");
        await this.seedDemoCapacity();
      }
    }
  }

  /**
   * Seed demo capacity for testing/demos.
   */
  async seedDemoCapacity(): Promise<void> {
    log.info("Seeding demo capacity");

    const demoInstances: SimulatedInstance[] = [
      {
        id: "gke-gpu-node-1",
        name: "gke-xidr-gpu-pool-node-1",
        zone: this.config.gcp.zone,
        gpuType: "nvidia-t4",
        memoryGb: 16,
        type: CapacityType.GKE_NODE_GPU,
        hourlyRate: 0.35,
      },
      {
        id: "gke-gpu-node-2",
        name: "gke-xidr-gpu-pool-node-2",
        zone: this.config.gcp.zone,
        gpuType: "nvidia-t4",
        memoryGb: 16,
        type: CapacityType.GKE_NODE_GPU,
        hourlyRate: 0.35,
      },
      {
        id: "spot-gpu-1",
        name: "xidr-spot-gpu-1",
        zone: this.config.gcp.zone,
        gpuType: "nvidia-l4",
        memoryGb: 24,
        type: CapacityType.SPOT_VM,
        hourlyRate: 0.21, // Spot pricing
      },
      {
        id: "cloud-run-gpu-1",
        name: "xidr-cloudrun-worker-1",
        zone: this.config.gcp.zone,
        gpuType: "nvidia-l4",
        memoryGb: 24,
        type: CapacityType.CLOUD_RUN_WORKER,
        hourlyRate: 0.58,
      },
    ];

    for (const instance of demoInstances) {
      this.simulatedInstances.set(instance.id, instance);

      const unit = await upsertCapacityUnit({
        type: instance.type,
        projectId: this.config.gcp.projectId,
        zone: instance.zone,
        gpuType: instance.gpuType,
        memoryGb: instance.memoryGb,
        onDemandHourlyUsd: instance.hourlyRate,
        clusterName: instance.type === CapacityType.GKE_NODE_GPU ? this.config.gcp.gkeClusterName : undefined,
        nodePool: instance.type === CapacityType.GKE_NODE_GPU ? this.config.gcp.gkeGpuNodePool : undefined,
        instanceName: instance.name,
        gpuIndex: 0,
        trustTier: TrustTier.INTERNAL,
        isolationMode: instance.type === CapacityType.GKE_NODE_GPU ? IsolationMode.MPS : IsolationMode.DEDICATED,
      });

      await recordAuditEvent({
        eventType: EventType.CAPACITY_DISCOVERED,
        source: EventSource.CAPACITY_FABRIC,
        capacityUnitId: unit.id,
        details: {
          gpuType: instance.gpuType,
          type: instance.type,
          instanceName: instance.name,
        },
        reasoning: `Discovered ${instance.gpuType} capacity from ${instance.type}`,
        decisionFactors: [instance.type, instance.gpuType],
      });

      this.emit("capacityDiscovered", unit.id, instance.gpuType);
      log.info("Registered capacity unit", { unitId: unit.id, gpuType: instance.gpuType });
    }
  }

  /**
   * Poll utilization for all capacity units.
   *
   * In production: query Cloud Monitoring API for GPU metrics.
   * For demo: simulate utilization changes.
   */
  async pollUtilization(): Promise<void> {
    try {
      if (USE_REAL_GKE) {
        // Use real Cloud Monitoring metrics
        const gkeDiscovery = getGKEDiscovery();
        await gkeDiscovery.updateAllUtilization();
        log.debug("Real utilization poll complete");
      } else {
        // For demo: simulate utilization
        const units = await getAllCapacityUnits();

        for (const unit of units) {
          const utilization = this.simulateUtilization(unit.id, unit.status);

          await updateUtilization(
            unit.id,
            utilization,
            this.config.capacity.idleThresholdPercent
          );

          this.emit("utilizationUpdated", unit.id, utilization);
        }

        log.debug("Simulated utilization poll complete", { units: units.length });
      }
    } catch (error) {
      log.error("Utilization poll failed", { error: (error as Error).message });
    }
  }

  /**
   * Simulate utilization for demo.
   */
  private simulateUtilization(unitId: string, status: string): number {
    // If leased, simulate active usage
    if (status === CapacityStatus.LEASED) {
      return 50 + Math.random() * 40; // 50-90%
    }

    // If available, simulate idle
    if (status === CapacityStatus.AVAILABLE) {
      return Math.random() * 10; // 0-10%
    }

    // Random for other states
    return Math.random() * 100;
  }

  /**
   * Check for capacity that can be marked as harvestable.
   */
  async checkHarvestable(): Promise<void> {
    try {
      const harvestable = await getHarvestableCapacity(
        this.config.capacity.harvestableIdleDurationMs
      );

      for (const unit of harvestable) {
        await updateCapacityUnit(unit.id, {
          status: CapacityStatus.HARVESTABLE,
        });

        await recordAuditEvent({
          eventType: EventType.CAPACITY_MARKED_HARVESTABLE,
          source: EventSource.CAPACITY_FABRIC,
          capacityUnitId: unit.id,
          details: {
            idleSince: unit.idleSince?.toISOString(),
            utilizationPercent: unit.utilizationPercent,
          },
          reasoning: `Idle for ${this.config.capacity.harvestableIdleDurationMs}ms with ${unit.utilizationPercent}% utilization`,
          decisionFactors: ["idle_duration_exceeded", "low_utilization"],
        });

        this.emit("capacityMarkedHarvestable", unit.id);
        log.info("Marked capacity as harvestable", { unitId: unit.id });
      }
    } catch (error) {
      log.error("Harvestable check failed", { error: (error as Error).message });
    }
  }

  /**
   * Register a new capacity source (e.g., when a new Spot VM starts).
   */
  async registerCapacity(
    type: CapacityType,
    instanceName: string,
    gpuType: string,
    memoryGb: number,
    hourlyRate: number
  ): Promise<string> {
    const unit = await upsertCapacityUnit({
      type,
      projectId: this.config.gcp.projectId,
      zone: this.config.gcp.zone,
      gpuType,
      memoryGb,
      onDemandHourlyUsd: hourlyRate,
      instanceName,
      gpuIndex: 0,
      trustTier: TrustTier.INTERNAL,
      isolationMode: IsolationMode.DEDICATED,
    });

    await recordAuditEvent({
      eventType: EventType.CAPACITY_DISCOVERED,
      source: EventSource.CAPACITY_FABRIC,
      capacityUnitId: unit.id,
      details: { gpuType, type, instanceName },
      reasoning: `New ${gpuType} capacity registered from ${type}`,
      decisionFactors: [type, gpuType, "manual_registration"],
    });

    this.emit("capacityDiscovered", unit.id, gpuType);
    log.info("Registered new capacity", { unitId: unit.id });

    return unit.id;
  }

  /**
   * Remove a capacity source (e.g., when a Spot VM is preempted).
   */
  async removeCapacity(unitId: string): Promise<void> {
    await deleteCapacityUnit(unitId);
    this.emit("capacityRemoved", unitId);
    log.info("Removed capacity", { unitId });
  }
}

// Singleton instance
let fabric: CapacityFabric | null = null;

export function getCapacityFabric(): CapacityFabric {
  if (!fabric) {
    fabric = new CapacityFabric();
  }
  return fabric;
}

// Main entry point
export async function run(): Promise<void> {
  log.info("Starting Capacity Fabric");

  // Initialize Firestore
  initFirestore();

  const capacityFabric = getCapacityFabric();

  // Handle shutdown
  process.on("SIGINT", () => {
    log.info("Received SIGINT, shutting down");
    capacityFabric.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    log.info("Received SIGTERM, shutting down");
    capacityFabric.stop();
    process.exit(0);
  });

  // Start fabric
  capacityFabric.start();

  // Keep process alive
  await new Promise(() => {});
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    log.error("Capacity fabric failed", { error: err.message });
    process.exit(1);
  });
}
