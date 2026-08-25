/**
 * Cloud connection models for connecting to GCP (and future cloud providers).
 */

import { z } from "zod";

// ============================================================================
// Enums
// ============================================================================

export enum CloudProvider {
  GCP = "gcp",
  // Future:
  // AWS = "aws",
  // AZURE = "azure",
}

export enum ConnectionMethod {
  SERVICE_ACCOUNT = "service_account",
  WORKLOAD_IDENTITY = "workload_identity",
}

export enum ConnectionStatus {
  PENDING = "pending",
  VERIFYING = "verifying",
  CONNECTED = "connected",
  ERROR = "error",
  REVOKED = "revoked",
}

export enum ClusterType {
  GKE_STANDARD = "gke_standard",
  GKE_AUTOPILOT = "gke_autopilot",
  // Future:
  // EKS = "eks",
  // AKS = "aks",
}

export enum ClusterManagementStatus {
  DISCOVERED = "discovered",
  PENDING_AGENT = "pending_agent",
  ACTIVE = "active",
  PAUSED = "paused",
  REMOVED = "removed",
}

export enum AgentStatus {
  UNKNOWN = "unknown",
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  OFFLINE = "offline",
}

// ============================================================================
// Required Permissions
// ============================================================================

export const REQUIRED_GCP_PERMISSIONS = [
  "container.clusters.get",
  "container.clusters.list",
  "container.nodePools.get",
  "container.nodePools.list",
  "compute.instances.get",
  "compute.instances.list",
  "monitoring.timeSeries.list",
  "storage.objects.create",
  "storage.objects.get",
  "storage.objects.delete",
] as const;

export type GCPPermission = typeof REQUIRED_GCP_PERMISSIONS[number];

// ============================================================================
// Types
// ============================================================================

export interface GCPConnectionConfig {
  projectId: string;
  projectNumber?: string;

  // Connection method
  connectionMethod: ConnectionMethod;

  // Service account (if applicable)
  serviceAccountEmail?: string;
  credentialsEncrypted?: string;  // KMS-encrypted JSON
  credentialsKeyId?: string;      // KMS key reference

  // Workload Identity (if applicable)
  workloadIdentityPool?: string;
  workloadIdentityProvider?: string;
}

export interface PermissionsVerification {
  verified: boolean;
  verifiedAt?: Date;
  permissions: Record<GCPPermission, boolean>;
  errors: string[];
}

export interface CloudConnection {
  id: string;
  organizationId: string;
  name: string;

  // Provider
  provider: CloudProvider;

  // Provider-specific config
  gcp?: GCPConnectionConfig;

  // Status
  status: ConnectionStatus;
  statusMessage?: string;
  lastHealthCheck?: Date;
  healthCheckError?: string;

  // Permissions
  permissionsVerified: PermissionsVerification;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// ============================================================================
// Managed Cluster Types
// ============================================================================

export interface GpuNodePool {
  name: string;
  gpuType: string;
  acceleratorCount: number;  // GPUs per node
  nodeCount: number;
  totalGpus: number;
  managedByXidr: boolean;
  labels?: Record<string, string>;
}

export interface GpuInventory {
  lastScanAt: Date;
  nodePools: GpuNodePool[];
  totalGpus: number;
  managedGpus: number;
}

export interface AgentInfo {
  installed: boolean;
  version?: string;
  lastHeartbeat?: Date;
  status: AgentStatus;
  podName?: string;
  nodeName?: string;
  nodeCount?: number;
  errors?: string[];
}

export interface ManagedCluster {
  id: string;
  organizationId: string;
  cloudConnectionId: string;

  // Cluster info
  name: string;
  location: string;  // Region or zone
  clusterType: ClusterType;
  endpoint?: string;

  // Management status
  managementStatus: ClusterManagementStatus;

  // Agent
  agent: AgentInfo;

  // GPU inventory
  gpuInventory: GpuInventory;

  // Settings (can override org defaults)
  settings?: {
    idleThresholdPercent?: number;
    idleDurationMinutes?: number;
    preemptionGraceSeconds?: number;
  };

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Agent Heartbeat
// ============================================================================

export interface AgentMetrics {
  gpusMonitored: number;
  activeLeases: number;
  pendingCheckpoints: number;
  cpuUsagePercent: number;
  memoryUsageMb: number;
  uptimeSeconds: number;
}

export interface AgentHeartbeat {
  id: string;
  clusterId: string;

  // Agent info
  agentVersion: string;
  podName: string;
  nodeName: string;

  // Status
  healthy: boolean;
  errors: string[];

  // Metrics
  metrics: AgentMetrics;

  // Timestamp
  timestamp: Date;
}

// ============================================================================
// Schemas
// ============================================================================

export const CreateCloudConnectionSchema = z.object({
  name: z.string().min(2).max(100),
  provider: z.nativeEnum(CloudProvider),
  gcp: z.object({
    projectId: z.string().min(6).max(30),
    connectionMethod: z.nativeEnum(ConnectionMethod),
    serviceAccountEmail: z.string().email().optional(),
    credentials: z.string().optional(), // Base64-encoded JSON (will be encrypted)
  }).optional(),
});

export const VerifyConnectionSchema = z.object({
  provider: z.nativeEnum(CloudProvider),
  projectId: z.string().min(6).max(30),
  credentials: z.string().optional(), // Base64-encoded SA JSON
});

export const SelectClustersSchema = z.object({
  clusterIds: z.array(z.string()).min(1),
});

export const AgentHeartbeatSchema = z.object({
  clusterId: z.string(),
  agentVersion: z.string(),
  podName: z.string(),
  nodeName: z.string(),
  healthy: z.boolean(),
  errors: z.array(z.string()).default([]),
  metrics: z.object({
    gpusMonitored: z.number(),
    activeLeases: z.number(),
    pendingCheckpoints: z.number(),
    cpuUsagePercent: z.number(),
    memoryUsageMb: z.number(),
    uptimeSeconds: z.number(),
  }),
});

// ============================================================================
// Helpers
// ============================================================================

export function createDefaultAgentInfo(): AgentInfo {
  return {
    installed: false,
    status: AgentStatus.UNKNOWN,
  };
}

export function createDefaultGpuInventory(): GpuInventory {
  return {
    lastScanAt: new Date(),
    nodePools: [],
    totalGpus: 0,
    managedGpus: 0,
  };
}

export function createDefaultPermissionsVerification(): PermissionsVerification {
  const permissions: Record<GCPPermission, boolean> = {} as Record<GCPPermission, boolean>;
  for (const perm of REQUIRED_GCP_PERMISSIONS) {
    permissions[perm] = false;
  }
  return {
    verified: false,
    permissions,
    errors: [],
  };
}

export function isConnectionHealthy(connection: CloudConnection): boolean {
  if (connection.status !== ConnectionStatus.CONNECTED) return false;
  if (!connection.lastHealthCheck) return false;

  // Consider unhealthy if no health check in last 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return connection.lastHealthCheck > fiveMinutesAgo;
}

export function isAgentHealthy(agent: AgentInfo): boolean {
  if (!agent.installed || agent.status !== AgentStatus.HEALTHY) return false;
  if (!agent.lastHeartbeat) return false;

  // Consider unhealthy if no heartbeat in last 2 minutes
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  return agent.lastHeartbeat > twoMinutesAgo;
}

export function getAgentInstallCommand(clusterId: string, orgId: string, apiEndpoint: string): string {
  // Two-step kubectl installation:
  // 1. Apply base manifests
  // 2. Create secret with credentials
  return `# Step 1: Apply Xid-R agent manifests
kubectl apply -f ${apiEndpoint}/install/agent.yaml

# Step 2: Create secret with your credentials
kubectl create secret generic xidr-agent-secrets \\
  --namespace xidr-system \\
  --from-literal=XIDR_ORGANIZATION_ID=${orgId} \\
  --from-literal=XIDR_CLUSTER_ID=${clusterId} \\
  --from-literal=XIDR_API_TOKEN=<your-api-token> \\
  --dry-run=client -o yaml | kubectl apply -f -

# Step 3: Restart agent to pick up credentials
kubectl rollout restart deployment/xidr-agent -n xidr-system`;
}

export function getHelmInstallCommand(clusterId: string, orgId: string, apiEndpoint: string): string {
  return `# Add Xid-R Helm repository
helm repo add xidr https://charts.xidr.dev
helm repo update

# Install Xid-R agent
helm install xidr-agent xidr/xidr-agent \\
  --namespace xidr-system \\
  --create-namespace \\
  --set organizationId=${orgId} \\
  --set clusterId=${clusterId} \\
  --set apiEndpoint=${apiEndpoint} \\
  --set apiToken=<your-api-token>`;
}
