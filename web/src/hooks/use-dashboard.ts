import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';

export interface GpuUtilization {
  id: string;
  instanceName: string | null;
  gpuType: string;
  gpuIndex: number;
  status: string;
  utilizationPercent: number;
  memoryGb: number;
  currentLeaseId: string | null;
}

export interface TenantBreakdown {
  tenantId: string;
  tenantName: string;
  activeLeases: number;
  totalLeases: number;
  totalSavingsUsd: number;
}

export interface CostAnalytics {
  hourly: Array<{ hour: string; savingsUsd: number; leaseCount: number }>;
  daily: Array<{ date: string; savingsUsd: number; leaseCount: number }>;
  totalBaselineCostUsd: number;
  totalActualCostUsd: number;
  totalSavingsUsd: number;
  savingsPercent: number;
}

export interface CheckpointAnalytics {
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

export interface GkeNode {
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

export interface DashboardState {
  stats: {
    activeLeases: number;
    pendingRequests: number;
    totalSavingsUsd: number;
    checkpointsCompleted: number;
  };
  capacity: {
    total: number;
    available: number;
    leased: number;
    byGpuType: Record<string, { total: number; available: number }>;
  };
  leases: Array<{
    id: string;
    status: string;
    agentId: string;
    gpuType: string;
    capacityLane: string | null;
    grantedAt: string | null;
  }>;
  events: Array<{
    id: string;
    type: string;
    timestamp: string;
    summary: string;
    leaseId: string | null;
  }>;
  gpuUtilization: GpuUtilization[];
  tenantBreakdown: TenantBreakdown[];
  costAnalytics: CostAnalytics;
  checkpointAnalytics: CheckpointAnalytics;
  gkeNodes: GkeNode[];
  updatedAt: string;
}

const initialState: DashboardState = {
  stats: {
    activeLeases: 0,
    pendingRequests: 0,
    totalSavingsUsd: 0,
    checkpointsCompleted: 0,
  },
  capacity: {
    total: 0,
    available: 0,
    leased: 0,
    byGpuType: {},
  },
  leases: [],
  events: [],
  gpuUtilization: [],
  tenantBreakdown: [],
  costAnalytics: {
    hourly: [],
    daily: [],
    totalBaselineCostUsd: 0,
    totalActualCostUsd: 0,
    totalSavingsUsd: 0,
    savingsPercent: 0,
  },
  checkpointAnalytics: {
    total: 0,
    complete: 0,
    restored: 0,
    failed: 0,
    successRate: 0,
    avgSizeBytes: 0,
    avgDurationMs: 0,
    recentCheckpoints: [],
  },
  gkeNodes: [],
  updatedAt: new Date().toISOString(),
};

export function useDashboard() {
  const [state, setState] = useState<DashboardState>(initialState);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch data via REST API
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [dashboardRes, leasesRes, eventsRes] = await Promise.all([
        api.getDashboard().catch(() => null),
        api.getLeases().catch(() => ({ leases: [] })),
        api.getRecentEvents(20).catch(() => ({ events: [] })),
      ]);

      if (dashboardRes) {
        setState({
          stats: {
            activeLeases: dashboardRes.stats.active_leases,
            pendingRequests: dashboardRes.stats.pending_requests,
            totalSavingsUsd: dashboardRes.stats.total_savings_usd,
            checkpointsCompleted: dashboardRes.stats.checkpoints_completed,
          },
          capacity: {
            total: dashboardRes.capacity.total,
            available: dashboardRes.capacity.available,
            leased: dashboardRes.capacity.leased,
            byGpuType: dashboardRes.capacity.by_gpu_type,
          },
          leases: leasesRes.leases.map((l) => ({
            id: l.id,
            status: l.status,
            agentId: l.tenantAgentId,
            gpuType: l.gpuType,
            capacityLane: l.capacityLane,
            grantedAt: l.grantedAt,
          })),
          events: eventsRes.events.map((e) => ({
            id: e.id,
            type: e.eventType || (e as unknown as { type: string }).type,
            timestamp: e.timestamp,
            summary: e.reasoning || (e.eventType || (e as unknown as { type: string }).type).replace(/_/g, ' '),
            leaseId: e.leaseId || (e as unknown as { lease_id: string | null }).lease_id,
          })),
          gpuUtilization: dashboardRes.gpuUtilization || [],
          tenantBreakdown: dashboardRes.tenantBreakdown || [],
          costAnalytics: dashboardRes.costAnalytics || initialState.costAnalytics,
          checkpointAnalytics: dashboardRes.checkpointAnalytics || initialState.checkpointAnalytics,
          gkeNodes: dashboardRes.gkeNodes || [],
          updatedAt: dashboardRes.updated_at,
        });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Connect to WebSocket for real-time updates
  const connectWebSocket = useCallback(() => {
    // Determine WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:8081`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'state') {
            const data = message.data;
            setState({
              stats: {
                activeLeases: data.stats.activeLeases,
                pendingRequests: data.stats.pendingRequests,
                totalSavingsUsd: data.stats.totalSavingsUsd,
                checkpointsCompleted: data.stats.checkpointsCompleted,
              },
              capacity: {
                total: data.capacity.total,
                available: data.capacity.available,
                leased: data.capacity.leased,
                byGpuType: data.capacity.byGpuType,
              },
              leases: data.leases,
              events: data.events,
              gpuUtilization: data.gpuUtilization || [],
              tenantBreakdown: data.tenantBreakdown || [],
              costAnalytics: data.costAnalytics || initialState.costAnalytics,
              checkpointAnalytics: data.checkpointAnalytics || initialState.checkpointAnalytics,
              gkeNodes: data.gkeNodes || [],
              updatedAt: data.updatedAt,
            });
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);
        wsRef.current = null;

        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setConnected(false);
      };
    } catch (err) {
      console.error('Failed to connect WebSocket:', err);
      setConnected(false);
    }
  }, []);

  // Initial data fetch and WebSocket connection
  useEffect(() => {
    fetchData();
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [fetchData, connectWebSocket]);

  // Manual refresh
  const refresh = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return {
    state,
    connected,
    loading,
    error,
    refresh,
  };
}
