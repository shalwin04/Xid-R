/**
 * API client for Xid-R backend
 */

const API_BASE = '/api';
const MCP_BASE = '/mcp/tools';

export interface LeaseRequest {
  gpu_type: string;
  duration_hint_seconds?: number;
  priority?: 'low' | 'normal' | 'high';
  a2a_endpoint: string;
  checkpointable?: boolean;
  agent_id?: string;
  agent_name?: string;
}

export interface LeaseResponse {
  lease_id: string;
  status: 'granted' | 'queued';
  capacity_unit_id?: string;
  connection_info?: {
    host: string;
    port: number;
    gpu_device: string;
  };
  preemption_warning_seconds?: number;
  checkpoint_target_uri?: string;
  queue_position?: number;
  message?: string;
}

export interface CheckpointAckRequest {
  lease_id: string;
  checkpoint_uri: string;
  size_bytes: number;
  duration_ms?: number;
}

export interface ReleaseRequest {
  lease_id: string;
}

export interface ReleaseResponse {
  released: boolean;
  billable_seconds: number;
  baseline_cost_usd: number;
  actual_cost_usd: number;
  savings_usd: number;
}

export interface SystemStatus {
  system: {
    active_leases: number;
    pending_requests: number;
    completed_leases: number;
    total_savings_usd: number;
    available_capacity: Record<string, { total: number; available: number }>;
    capacity_summary: {
      total: number;
      available: number;
      leased: number;
    };
  };
}

export interface LeaseStatus {
  lease: {
    id: string;
    status: string;
    gpu_type: string;
    capacity_unit_id: string | null;
    capacity_lane: string | null;
    granted_at: string | null;
    checkpoint_uri: string | null;
    preemption_warning_seconds: number;
  };
  latest_checkpoint: {
    id: string;
    uri: string;
    size_bytes: number;
    created_at: string;
  } | null;
}

export interface ExplainResponse {
  lease_id: string;
  lease_status: string;
  explanation: string;
  timeline: Array<{
    timestamp: string;
    event: string;
    details: string;
  }>;
  decision_factors: string[];
}

export interface GpuUtilizationData {
  id: string;
  instanceName: string | null;
  gpuType: string;
  gpuIndex: number;
  status: string;
  utilizationPercent: number;
  memoryGb: number;
  currentLeaseId: string | null;
}

export interface TenantBreakdownData {
  tenantId: string;
  tenantName: string;
  activeLeases: number;
  totalLeases: number;
  totalSavingsUsd: number;
}

export interface CostAnalyticsData {
  hourly: Array<{ hour: string; savingsUsd: number; leaseCount: number }>;
  daily: Array<{ date: string; savingsUsd: number; leaseCount: number }>;
  totalBaselineCostUsd: number;
  totalActualCostUsd: number;
  totalSavingsUsd: number;
  savingsPercent: number;
}

export interface CheckpointAnalyticsData {
  total: number;
  complete: number;
  restored: number;
  failed: number;
  successRate: number;
  avgSizeBytes: number;
  avgDurationMs: number;
  recentCheckpoints: Array<{
    id: string;
    leaseId: string;
    status: string;
    sizeBytes: number;
    durationMs: number;
    createdAt: string;
  }>;
}

export interface GkeNodeData {
  nodeName: string;
  nodePool: string | null;
  zone: string;
  gpuCount: number;
  gpuType: string;
  status: 'healthy' | 'degraded' | 'offline';
  totalUtilization: number;
  gpus: Array<{
    gpuIndex: number;
    status: string;
    utilizationPercent: number;
  }>;
}

export interface DashboardData {
  stats: {
    active_leases: number;
    pending_requests: number;
    total_savings_usd: number;
    checkpoints_completed: number;
  };
  capacity: {
    total: number;
    available: number;
    leased: number;
    by_gpu_type: Record<string, { total: number; available: number }>;
  };
  recent_events: Array<{
    type: string;
    timestamp: string;
    summary: string;
  }>;
  gpuUtilization?: GpuUtilizationData[];
  tenantBreakdown?: TenantBreakdownData[];
  costAnalytics?: CostAnalyticsData;
  checkpointAnalytics?: CheckpointAnalyticsData;
  gkeNodes?: GkeNodeData[];
  updated_at: string;
}

export interface Lease {
  id: string;
  status: string;
  tenantAgentId: string;
  gpuType: string;
  capacityUnitId: string | null;
  capacityLane: string | null;
  grantedAt: string | null;
  priority: string;
  checkpointable: boolean;
}

export interface CapacityUnit {
  id: string;
  type: string;
  gpuType: string;
  status: string;
  utilizationPercent: number;
  currentLeaseId: string | null;
  isolationMode: string;
  trustTier: string;
  preemptionGraceMs: number;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: string;
  type?: string; // Backend may return 'type' instead of 'eventType'
  leaseId: string | null;
  lease_id?: string | null; // Backend may return 'lease_id' instead of 'leaseId'
  capacityUnitId: string | null;
  capacity_unit_id?: string | null;
  agentId: string | null;
  agent_id?: string | null;
  reasoning: string | null;
  decisionFactors: string[];
}

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // MCP Tools
  async requestGpu(request: LeaseRequest): Promise<LeaseResponse> {
    return this.request<LeaseResponse>(`${MCP_BASE}/xidr_request_gpu`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async checkpointAck(request: CheckpointAckRequest): Promise<{ acknowledged: boolean; resume_queued: boolean }> {
    return this.request(`${MCP_BASE}/xidr_checkpoint_ack`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async releaseLease(request: ReleaseRequest): Promise<ReleaseResponse> {
    return this.request<ReleaseResponse>(`${MCP_BASE}/xidr_release`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getStatus(leaseId?: string): Promise<SystemStatus | LeaseStatus> {
    return this.request(`${MCP_BASE}/xidr_status`, {
      method: 'POST',
      body: JSON.stringify(leaseId ? { lease_id: leaseId } : {}),
    });
  }

  async explain(leaseId: string, eventType?: string): Promise<ExplainResponse> {
    return this.request<ExplainResponse>(`${MCP_BASE}/xidr_explain`, {
      method: 'POST',
      body: JSON.stringify({ lease_id: leaseId, event_type: eventType }),
    });
  }

  // REST API
  async getDashboard(): Promise<DashboardData> {
    return this.request<DashboardData>(`${API_BASE}/system/dashboard`);
  }

  async getSystemOverview(): Promise<{
    leases: { active: number; pending: number; completed: number; lost: number; totalSavingsUsd: number };
    capacity: { total: number; available: number; leased: number; harvestable: number; byGpuType: Record<string, { total: number; available: number }> };
    checkpoints: { total: number; complete: number; restored: number; failed: number };
  }> {
    return this.request(`${API_BASE}/system/overview`);
  }

  async getRecentEvents(limit = 50): Promise<{ events: AuditEvent[] }> {
    return this.request(`${API_BASE}/system/events?limit=${limit}`);
  }

  async getLeases(status?: string): Promise<{ leases: Lease[] }> {
    const url = status ? `${API_BASE}/leases?status=${status}` : `${API_BASE}/leases`;
    return this.request(url);
  }

  async getLease(id: string): Promise<{ lease: Lease }> {
    return this.request(`${API_BASE}/leases/${id}`);
  }

  async getPendingQueue(): Promise<{ queue: Array<{ position: number; lease_id: string; agent_id: string; gpu_type: string; priority: string; requested_at: string }> }> {
    return this.request(`${API_BASE}/leases/queue/pending`);
  }

  async getLeaseStats(): Promise<{ stats: { active: number; pending: number; completed: number; lost: number; totalSavingsUsd: number } }> {
    return this.request(`${API_BASE}/leases/stats/summary`);
  }

  async getCapacityUnits(): Promise<{ capacity_units: CapacityUnit[] }> {
    return this.request(`${API_BASE}/capacity`);
  }

  async getCapacitySummary(): Promise<{ summary: { total: number; available: number; leased: number; harvestable: number; byGpuType: Record<string, { total: number; available: number }> } }> {
    return this.request(`${API_BASE}/capacity/summary`);
  }

  async getAvailableCapacity(gpuType: string): Promise<{ gpu_type: string; available_count: number; units: CapacityUnit[] }> {
    return this.request(`${API_BASE}/capacity/available/${gpuType}`);
  }

  async registerCapacity(data: {
    type: string;
    project_id: string;
    zone: string;
    gpu_type: string;
    memory_gb: number;
    on_demand_hourly_usd: number;
    instance_name?: string;
  }): Promise<{ capacity_unit: CapacityUnit }> {
    return this.request(`${API_BASE}/capacity/register`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAgents(): Promise<{ agents: Array<{ id: string; name: string; a2aEndpoint: string; checkpointable: boolean; trustTier: string }> }> {
    return this.request(`${API_BASE}/agents`);
  }

  async registerAgent(data: {
    id: string;
    name: string;
    a2a_endpoint: string;
    checkpointable?: boolean;
  }): Promise<{ agent: { id: string; name: string } }> {
    return this.request(`${API_BASE}/agents/register`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Health check
  async healthCheck(): Promise<{ status: string; version: string }> {
    return this.request('/health');
  }
}

export const api = new ApiClient();
export default api;
