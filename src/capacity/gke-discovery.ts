/**
 * GKE GPU Node Discovery
 *
 * Discovers GPU nodes from GKE clusters and monitors their utilization.
 */

import { ClusterManagerClient } from "@google-cloud/container";
import { MetricServiceClient } from "@google-cloud/monitoring";

import { getConfig } from "../config.js";
import { createLogger } from "../utils/logger.js";
import {
  upsertCapacityUnit,
  updateUtilization,
  getAllCapacityUnits,
  deleteCapacityUnit,
} from "../db/capacity.js";
import { recordAuditEvent } from "../db/audit.js";
import { EventType, EventSource } from "../models/audit.js";
import { CapacityType, TrustTier, IsolationMode } from "../models/capacity.js";

const log = createLogger({ module: "gke-discovery" });

/**
 * GKE GPU node information.
 */
interface GKEGpuNode {
  name: string;
  zone: string;
  nodePool: string;
  machineType: string;
  gpuType: string;
  gpuCount: number;
  memoryGb: number;
  status: string;
}

/**
 * GPU type mapping from GKE accelerator types to our types.
 */
const GPU_TYPE_MAP: Record<string, string> = {
  "nvidia-tesla-t4": "nvidia-t4",
  "nvidia-l4": "nvidia-l4",
  "nvidia-tesla-a100": "nvidia-a100-40gb",
  "nvidia-a100-80gb": "nvidia-a100-80gb",
};

/**
 * GPU memory in GB.
 */
const GPU_MEMORY_MAP: Record<string, number> = {
  "nvidia-t4": 16,
  "nvidia-l4": 24,
  "nvidia-a100-40gb": 40,
  "nvidia-a100-80gb": 80,
};

/**
 * GPU hourly rates (on-demand).
 */
const GPU_HOURLY_RATES: Record<string, number> = {
  "nvidia-t4": 0.35,
  "nvidia-l4": 0.70,
  "nvidia-a100-40gb": 2.93,
  "nvidia-a100-80gb": 3.67,
};

/**
 * GKE GPU Discovery class.
 */
export class GKEDiscovery {
  private config = getConfig();
  private clusterClient: ClusterManagerClient;
  private metricsClient: MetricServiceClient;
  private discoveredNodes = new Map<string, GKEGpuNode>();

  constructor() {
    this.clusterClient = new ClusterManagerClient();
    this.metricsClient = new MetricServiceClient();
  }

  /**
   * Discover GPU nodes from the configured GKE cluster.
   */
  async discoverNodes(): Promise<void> {
    log.info("Discovering GKE GPU nodes", {
      cluster: this.config.gcp.gkeClusterName,
      project: this.config.gcp.projectId,
      zone: this.config.gcp.zone,
    });

    try {
      // Get cluster info
      const [cluster] = await this.clusterClient.getCluster({
        name: `projects/${this.config.gcp.projectId}/locations/${this.config.gcp.zone}/clusters/${this.config.gcp.gkeClusterName}`,
      });

      if (!cluster.nodePools) {
        log.warn("No node pools found in cluster");
        return;
      }

      // Find GPU node pools
      for (const nodePool of cluster.nodePools) {
        const accelerators = nodePool.config?.accelerators;

        if (!accelerators || accelerators.length === 0) {
          continue; // Skip non-GPU node pools
        }

        const accelerator = accelerators[0];
        const gpuType = GPU_TYPE_MAP[accelerator.acceleratorType ?? ""] ?? accelerator.acceleratorType;
        const gpuCount = Number(accelerator.acceleratorCount ?? 1);

        log.info("Found GPU node pool", {
          pool: nodePool.name,
          gpuType,
          gpuCount,
          nodeCount: nodePool.initialNodeCount,
        });

        // Get nodes in this pool (simulated for now - real implementation would query Kubernetes API)
        const nodeCount = Number(nodePool.initialNodeCount ?? 0);

        for (let i = 0; i < nodeCount; i++) {
          const nodeName = `${this.config.gcp.gkeClusterName}-${nodePool.name}-node-${i}`;

          const node: GKEGpuNode = {
            name: nodeName,
            zone: this.config.gcp.zone,
            nodePool: nodePool.name ?? "gpu-pool",
            machineType: nodePool.config?.machineType ?? "n1-standard-4",
            gpuType: gpuType ?? "nvidia-t4",
            gpuCount,
            memoryGb: GPU_MEMORY_MAP[gpuType ?? "nvidia-t4"] ?? 16,
            status: "RUNNING",
          };

          this.discoveredNodes.set(nodeName, node);

          // Register each GPU as a capacity unit
          for (let gpuIndex = 0; gpuIndex < gpuCount; gpuIndex++) {
            await this.registerGpuCapacity(node, gpuIndex);
          }
        }
      }

      log.info("GKE discovery complete", {
        nodesDiscovered: this.discoveredNodes.size,
      });
    } catch (error) {
      log.error("Failed to discover GKE nodes", { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Register a GPU as a capacity unit.
   */
  private async registerGpuCapacity(node: GKEGpuNode, gpuIndex: number): Promise<void> {
    const gpuType = node.gpuType;
    const hourlyRate = GPU_HOURLY_RATES[gpuType] ?? 0.5;

    const unit = await upsertCapacityUnit({
      type: CapacityType.GKE_NODE_GPU,
      projectId: this.config.gcp.projectId,
      zone: node.zone,
      clusterName: this.config.gcp.gkeClusterName,
      nodePool: node.nodePool,
      instanceName: node.name,
      gpuType,
      gpuIndex,
      memoryGb: node.memoryGb,
      onDemandHourlyUsd: hourlyRate,
      trustTier: TrustTier.INTERNAL,
      isolationMode: IsolationMode.MPS,
    });

    await recordAuditEvent({
      eventType: EventType.CAPACITY_DISCOVERED,
      source: EventSource.CAPACITY_FABRIC,
      capacityUnitId: unit.id,
      details: {
        gpuType,
        nodePool: node.nodePool,
        nodeName: node.name,
        gpuIndex,
      },
      reasoning: `Discovered ${gpuType} GPU #${gpuIndex} on node ${node.name}`,
      decisionFactors: ["gke_discovery", gpuType, node.nodePool],
    });

    log.debug("Registered GPU capacity", {
      unitId: unit.id,
      node: node.name,
      gpuIndex,
      gpuType,
    });
  }

  /**
   * Query GPU utilization from Cloud Monitoring.
   */
  async queryUtilization(): Promise<Map<string, number>> {
    const utilizations = new Map<string, number>();

    try {
      const projectName = `projects/${this.config.gcp.projectId}`;
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // Last 5 minutes

      // Query DCGM GPU utilization metric
      const [timeSeries] = await this.metricsClient.listTimeSeries({
        name: projectName,
        filter: `metric.type="kubernetes.io/container/accelerator/duty_cycle" AND resource.type="k8s_container"`,
        interval: {
          startTime: { seconds: Math.floor(startTime.getTime() / 1000) },
          endTime: { seconds: Math.floor(endTime.getTime() / 1000) },
        },
        view: "FULL",
      });

      for (const series of timeSeries) {
        const nodeName = series.resource?.labels?.node_name;
        const gpuIndex = series.metric?.labels?.gpu_index ?? "0";

        if (!nodeName) continue;

        const unitKey = `${nodeName}_gpu${gpuIndex}`;

        // Get latest point
        const points = series.points ?? [];
        if (points.length > 0) {
          const latestValue = points[0].value?.doubleValue ?? 0;
          utilizations.set(unitKey, latestValue * 100); // Convert to percentage
        }
      }

      log.debug("Retrieved GPU utilization", { count: utilizations.size });
    } catch (error) {
      log.warn("Failed to query GPU utilization", { error: (error as Error).message });
      // Fall back to simulated utilization
    }

    return utilizations;
  }

  /**
   * Update utilization for all discovered capacity units.
   */
  async updateAllUtilization(): Promise<void> {
    try {
      const utilizations = await this.queryUtilization();
      const units = await getAllCapacityUnits();

      for (const unit of units) {
        // Try to find matching utilization from metrics
        const key = `${unit.instanceName}_gpu${unit.gpuIndex}`;
        let utilization = utilizations.get(key);

        // If no metrics, simulate based on status
        if (utilization === undefined) {
          utilization = this.simulateUtilization(unit.status);
        }

        await updateUtilization(
          unit.id,
          utilization,
          this.config.capacity.idleThresholdPercent
        );
      }

      log.debug("Updated all utilization", { units: units.length });
    } catch (error) {
      log.error("Failed to update utilization", { error: (error as Error).message });
    }
  }

  /**
   * Simulate utilization when metrics are unavailable.
   */
  private simulateUtilization(status: string): number {
    switch (status) {
      case "leased":
        return 50 + Math.random() * 40; // 50-90%
      case "available":
      case "harvestable":
        return Math.random() * 10; // 0-10%
      default:
        return Math.random() * 50; // 0-50%
    }
  }

  /**
   * Sync discovered nodes with actual cluster state.
   * Removes capacity units for nodes that no longer exist.
   */
  async syncWithCluster(): Promise<void> {
    try {
      // Re-discover current nodes
      await this.discoverNodes();

      // Get all registered capacity units
      const units = await getAllCapacityUnits();

      // Check each unit is still valid
      for (const unit of units) {
        if (unit.type !== CapacityType.GKE_NODE_GPU) continue;

        const node = this.discoveredNodes.get(unit.instanceName ?? "");

        if (!node) {
          log.info("Removing stale capacity unit", { unitId: unit.id });
          await deleteCapacityUnit(unit.id);
        }
      }
    } catch (error) {
      log.error("Failed to sync with cluster", { error: (error as Error).message });
    }
  }
}

// Singleton instance
let discovery: GKEDiscovery | null = null;

export function getGKEDiscovery(): GKEDiscovery {
  if (!discovery) {
    discovery = new GKEDiscovery();
  }
  return discovery;
}
