/**
 * Cloud connection and managed cluster database operations.
 */

import { getFirestore } from "./firestore.js";
import { createLogger } from "../utils/logger.js";
import { generateId } from "../utils/ids.js";
import {
  CloudConnection,
  CloudProvider,
  ConnectionStatus,
  ManagedCluster,
  ClusterManagementStatus,
  AgentHeartbeat,
  AgentStatus,
  createDefaultAgentInfo,
  createDefaultGpuInventory,
  createDefaultPermissionsVerification,
} from "../models/cloud-connection.js";

const log = createLogger({ module: "db:cloud-connections" });

const CONNECTIONS_COLLECTION = "cloud_connections";
const CLUSTERS_COLLECTION = "managed_clusters";
const HEARTBEATS_COLLECTION = "agent_heartbeats";

// ============================================================================
// Cloud Connection Operations
// ============================================================================

/**
 * Create a new cloud connection.
 */
export async function createCloudConnection(data: {
  organizationId: string;
  name: string;
  provider: CloudProvider;
  gcp?: {
    projectId: string;
    connectionMethod: string;
    serviceAccountEmail?: string;
    credentialsEncrypted?: string;
  };
  createdBy: string;
}): Promise<CloudConnection> {
  const db = getFirestore();
  const id = generateId("conn");

  const connection: CloudConnection = {
    id,
    organizationId: data.organizationId,
    name: data.name,
    provider: data.provider,
    gcp: data.gcp as CloudConnection["gcp"],
    status: ConnectionStatus.PENDING,
    permissionsVerified: createDefaultPermissionsVerification(),
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: data.createdBy,
  };

  await db.collection(CONNECTIONS_COLLECTION).doc(id).set({
    ...connection,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  });

  log.info("Created cloud connection", { id, organizationId: data.organizationId, provider: data.provider });
  return connection;
}

/**
 * Get cloud connection by ID.
 */
export async function getCloudConnection(id: string): Promise<CloudConnection | null> {
  const db = getFirestore();
  const doc = await db.collection(CONNECTIONS_COLLECTION).doc(id).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    lastHealthCheck: data.lastHealthCheck?.toDate(),
    permissionsVerified: {
      ...data.permissionsVerified,
      verifiedAt: data.permissionsVerified?.verifiedAt?.toDate(),
    },
  } as CloudConnection;
}

/**
 * List cloud connections for an organization.
 * Simplified query to avoid composite index requirement.
 */
export async function listCloudConnections(organizationId: string): Promise<CloudConnection[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(CONNECTIONS_COLLECTION)
    .where("organizationId", "==", organizationId)
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        lastHealthCheck: data.lastHealthCheck?.toDate(),
        permissionsVerified: {
          ...data.permissionsVerified,
          verifiedAt: data.permissionsVerified?.verifiedAt?.toDate(),
        },
      } as CloudConnection;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Update cloud connection.
 */
export async function updateCloudConnection(
  id: string,
  updates: Partial<Omit<CloudConnection, "id" | "organizationId" | "createdAt" | "createdBy">>
): Promise<void> {
  const db = getFirestore();
  await db.collection(CONNECTIONS_COLLECTION).doc(id).update({
    ...updates,
    updatedAt: new Date(),
  });
  log.debug("Updated cloud connection", { id });
}

/**
 * Update connection status.
 */
export async function updateConnectionStatus(
  id: string,
  status: ConnectionStatus,
  statusMessage?: string
): Promise<void> {
  await updateCloudConnection(id, {
    status,
    statusMessage,
    lastHealthCheck: new Date(),
  });
  log.info("Updated connection status", { id, status });
}

/**
 * Mark permissions as verified.
 */
export async function markPermissionsVerified(
  id: string,
  permissions: Record<string, boolean>,
  errors: string[]
): Promise<void> {
  const allVerified = Object.values(permissions).every(v => v === true);

  await updateCloudConnection(id, {
    permissionsVerified: {
      verified: allVerified,
      verifiedAt: new Date(),
      permissions: permissions as CloudConnection["permissionsVerified"]["permissions"],
      errors,
    },
    status: allVerified ? ConnectionStatus.CONNECTED : ConnectionStatus.ERROR,
    statusMessage: allVerified ? "All permissions verified" : `Missing permissions: ${errors.join(", ")}`,
  });

  log.info("Updated permissions verification", { id, verified: allVerified });
}

/**
 * Delete cloud connection.
 */
export async function deleteCloudConnection(id: string): Promise<void> {
  const db = getFirestore();

  // Delete associated clusters first
  const clusters = await listManagedClusters(id);
  for (const cluster of clusters) {
    await deleteManagedCluster(cluster.id);
  }

  await db.collection(CONNECTIONS_COLLECTION).doc(id).delete();
  log.info("Deleted cloud connection", { id });
}

// ============================================================================
// Managed Cluster Operations
// ============================================================================

/**
 * Create a managed cluster.
 */
export async function createManagedCluster(data: {
  organizationId: string;
  cloudConnectionId: string;
  name: string;
  location: string;
  clusterType: ManagedCluster["clusterType"];
  endpoint?: string;
}): Promise<ManagedCluster> {
  const db = getFirestore();
  const id = generateId("cluster");

  const cluster: ManagedCluster = {
    id,
    organizationId: data.organizationId,
    cloudConnectionId: data.cloudConnectionId,
    name: data.name,
    location: data.location,
    clusterType: data.clusterType,
    endpoint: data.endpoint || undefined,
    managementStatus: ClusterManagementStatus.DISCOVERED,
    agent: createDefaultAgentInfo(),
    gpuInventory: createDefaultGpuInventory(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Filter out undefined values before saving to Firestore
  const clusterData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cluster)) {
    if (value !== undefined) {
      clusterData[key] = value;
    }
  }

  await db.collection(CLUSTERS_COLLECTION).doc(id).set(clusterData);

  log.info("Created managed cluster", { id, name: data.name });
  return cluster;
}

/**
 * Get managed cluster by ID.
 */
export async function getManagedCluster(id: string): Promise<ManagedCluster | null> {
  const db = getFirestore();
  const doc = await db.collection(CLUSTERS_COLLECTION).doc(id).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    agent: {
      ...data.agent,
      lastHeartbeat: data.agent?.lastHeartbeat?.toDate(),
    },
    gpuInventory: {
      ...data.gpuInventory,
      lastScanAt: data.gpuInventory?.lastScanAt?.toDate() || new Date(),
    },
  } as ManagedCluster;
}

/**
 * Get managed cluster by name within a connection.
 */
export async function getManagedClusterByName(
  cloudConnectionId: string,
  name: string
): Promise<ManagedCluster | null> {
  const db = getFirestore();
  const snapshot = await db
    .collection(CLUSTERS_COLLECTION)
    .where("cloudConnectionId", "==", cloudConnectionId)
    .where("name", "==", name)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    agent: {
      ...data.agent,
      lastHeartbeat: data.agent?.lastHeartbeat?.toDate(),
    },
    gpuInventory: {
      ...data.gpuInventory,
      lastScanAt: data.gpuInventory?.lastScanAt?.toDate() || new Date(),
    },
  } as ManagedCluster;
}

/**
 * List managed clusters for a cloud connection.
 * Simplified query to avoid composite index requirement.
 */
export async function listManagedClusters(cloudConnectionId: string): Promise<ManagedCluster[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(CLUSTERS_COLLECTION)
    .where("cloudConnectionId", "==", cloudConnectionId)
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        agent: {
          ...data.agent,
          lastHeartbeat: data.agent?.lastHeartbeat?.toDate(),
        },
        gpuInventory: {
          ...data.gpuInventory,
          lastScanAt: data.gpuInventory?.lastScanAt?.toDate() || new Date(),
        },
      } as ManagedCluster;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * List all managed clusters for an organization.
 * Simplified query to avoid composite index requirement.
 */
export async function listOrganizationClusters(organizationId: string): Promise<ManagedCluster[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(CLUSTERS_COLLECTION)
    .where("organizationId", "==", organizationId)
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        agent: {
          ...data.agent,
          lastHeartbeat: data.agent?.lastHeartbeat?.toDate(),
        },
        gpuInventory: {
          ...data.gpuInventory,
          lastScanAt: data.gpuInventory?.lastScanAt?.toDate() || new Date(),
        },
      } as ManagedCluster;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Update managed cluster.
 */
export async function updateManagedCluster(
  id: string,
  updates: Partial<Omit<ManagedCluster, "id" | "organizationId" | "cloudConnectionId" | "createdAt">>
): Promise<void> {
  const db = getFirestore();
  await db.collection(CLUSTERS_COLLECTION).doc(id).update({
    ...updates,
    updatedAt: new Date(),
  });
  log.debug("Updated managed cluster", { id });
}

/**
 * Update cluster management status.
 */
export async function updateClusterManagementStatus(
  id: string,
  status: ClusterManagementStatus
): Promise<void> {
  await updateManagedCluster(id, { managementStatus: status });
  log.info("Updated cluster management status", { id, status });
}

/**
 * Update GPU inventory for a cluster.
 */
export async function updateClusterGpuInventory(
  id: string,
  inventory: ManagedCluster["gpuInventory"]
): Promise<void> {
  await updateManagedCluster(id, { gpuInventory: inventory });
  log.debug("Updated cluster GPU inventory", { id, totalGpus: inventory.totalGpus });
}

/**
 * Delete managed cluster.
 */
export async function deleteManagedCluster(id: string): Promise<void> {
  const db = getFirestore();
  await db.collection(CLUSTERS_COLLECTION).doc(id).delete();
  log.info("Deleted managed cluster", { id });
}

// ============================================================================
// Agent Heartbeat Operations
// ============================================================================

/**
 * Record agent heartbeat.
 */
export async function recordAgentHeartbeat(data: {
  clusterId: string;
  agentVersion: string;
  podName: string;
  nodeName: string;
  healthy: boolean;
  errors: string[];
  metrics: AgentHeartbeat["metrics"];
}): Promise<void> {
  const db = getFirestore();
  const id = generateId("hb");

  const heartbeat: AgentHeartbeat = {
    id,
    ...data,
    timestamp: new Date(),
  };

  // Store heartbeat
  await db.collection(HEARTBEATS_COLLECTION).doc(id).set({
    ...heartbeat,
    timestamp: heartbeat.timestamp,
  });

  // Update cluster agent info
  const cluster = await getManagedCluster(data.clusterId);
  if (cluster) {
    const agentStatus = data.healthy ? AgentStatus.HEALTHY : AgentStatus.DEGRADED;
    await updateManagedCluster(data.clusterId, {
      agent: {
        installed: true,
        version: data.agentVersion,
        lastHeartbeat: new Date(),
        status: agentStatus,
        podName: data.podName,
        nodeName: data.nodeName,
        errors: data.errors,
      },
      managementStatus: data.healthy ? ClusterManagementStatus.ACTIVE : cluster.managementStatus,
    });
  }

  log.debug("Recorded agent heartbeat", { clusterId: data.clusterId, healthy: data.healthy });
}

/**
 * Get recent heartbeats for a cluster.
 * Simplified query to avoid composite index requirement.
 */
export async function getRecentHeartbeats(clusterId: string, limit = 10): Promise<AgentHeartbeat[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(HEARTBEATS_COLLECTION)
    .where("clusterId", "==", clusterId)
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        timestamp: data.timestamp?.toDate() || new Date(),
      } as AgentHeartbeat;
    })
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}

/**
 * Check for stale agents (no heartbeat in X minutes).
 */
export async function findStaleAgents(staleMinutes = 5): Promise<ManagedCluster[]> {
  const db = getFirestore();
  const staleThreshold = new Date(Date.now() - staleMinutes * 60 * 1000);

  const snapshot = await db
    .collection(CLUSTERS_COLLECTION)
    .where("managementStatus", "==", ClusterManagementStatus.ACTIVE)
    .where("agent.installed", "==", true)
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        agent: {
          ...data.agent,
          lastHeartbeat: data.agent?.lastHeartbeat?.toDate(),
        },
        gpuInventory: {
          ...data.gpuInventory,
          lastScanAt: data.gpuInventory?.lastScanAt?.toDate() || new Date(),
        },
      } as ManagedCluster;
    })
    .filter((cluster) => {
      if (!cluster.agent.lastHeartbeat) return true;
      return cluster.agent.lastHeartbeat < staleThreshold;
    });
}

/**
 * Mark stale agents as offline.
 */
export async function markStaleAgentsOffline(staleMinutes = 5): Promise<number> {
  const staleClusters = await findStaleAgents(staleMinutes);

  for (const cluster of staleClusters) {
    await updateManagedCluster(cluster.id, {
      agent: {
        ...cluster.agent,
        status: AgentStatus.OFFLINE,
      },
    });
  }

  if (staleClusters.length > 0) {
    log.warn("Marked stale agents as offline", { count: staleClusters.length });
  }

  return staleClusters.length;
}
