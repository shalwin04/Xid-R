/**
 * Dashboard Server
 *
 * Real-time WebSocket server for the Xid-R dashboard.
 * Broadcasts system state updates to connected clients.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { WebSocketServer, WebSocket } from "ws";

import { getConfig } from "../config.js";
import { createLogger } from "../utils/logger.js";
import { initFirestore } from "../db/firestore.js";
import { getLeaseStats, getLeasesByStatus, getLeasesByTenant, getCostAnalytics } from "../db/leases.js";
import { getCapacitySummary, getGpuUtilization, getGkeNodeStatus } from "../db/capacity.js";
import { getCheckpointStats, getCheckpointAnalytics } from "../db/checkpoints.js";
import { getRecentAuditEvents } from "../db/audit.js";
import { LeaseStatus } from "../models/lease.js";
import { getTenant } from "../db/tenants.js";

const log = createLogger({ module: "dashboard" });

interface DashboardState {
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
  // New metrics
  gpuUtilization: Array<{
    id: string;
    instanceName: string | null;
    gpuType: string;
    gpuIndex: number;
    status: string;
    utilizationPercent: number;
    memoryGb: number;
    currentLeaseId: string | null;
  }>;
  tenantBreakdown: Array<{
    tenantId: string;
    tenantName: string;
    activeLeases: number;
    totalLeases: number;
    totalSavingsUsd: number;
  }>;
  costAnalytics: {
    hourly: Array<{ hour: string; savingsUsd: number; leaseCount: number }>;
    daily: Array<{ date: string; savingsUsd: number; leaseCount: number }>;
    totalBaselineCostUsd: number;
    totalActualCostUsd: number;
    totalSavingsUsd: number;
    savingsPercent: number;
  };
  checkpointAnalytics: {
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
  };
  gkeNodes: Array<{
    nodeName: string;
    nodePool: string | null;
    zone: string;
    gpuCount: number;
    gpuType: string;
    status: "healthy" | "degraded" | "offline";
    totalUtilization: number;
    gpus: Array<{
      gpuIndex: number;
      status: string;
      utilizationPercent: number;
    }>;
  }>;
  updatedAt: string;
}

export class DashboardServer {
  private config = getConfig();
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private updateInterval: NodeJS.Timeout | null = null;

  /**
   * Start the dashboard server.
   */
  async start(): Promise<void> {
    const app = new Hono();

    // Serve static files
    app.use("/static/*", serveStatic({ root: "./src/dashboard" }));

    // API endpoint for initial state
    app.get("/api/state", async (c) => {
      const state = await this.getState();
      return c.json(state);
    });

    // Serve the dashboard HTML
    app.get("/", (c) => {
      return c.html(this.getDashboardHtml());
    });

    // Start HTTP server
    const httpServer = serve({
      fetch: app.fetch,
      port: this.config.api.port + 1, // Dashboard on port 8081
    });

    // Start WebSocket server
    this.wss = new WebSocketServer({ server: httpServer as unknown as import("http").Server });

    this.wss.on("connection", (ws) => {
      log.info("Dashboard client connected");
      this.clients.add(ws);

      // Send initial state
      this.sendState(ws);

      ws.on("close", () => {
        log.info("Dashboard client disconnected");
        this.clients.delete(ws);
      });

      ws.on("error", (err) => {
        log.error("WebSocket error", { error: err.message });
        this.clients.delete(ws);
      });
    });

    // Start periodic updates
    this.updateInterval = setInterval(
      () => this.broadcastState(),
      this.config.dashboard.updateIntervalMs
    );

    log.info("Dashboard server started", {
      port: this.config.api.port + 1,
      wsPort: this.config.dashboard.wsPort,
    });
  }

  /**
   * Stop the dashboard server.
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.clients.clear();
    log.info("Dashboard server stopped");
  }

  /**
   * Get current dashboard state.
   */
  private async getState(): Promise<DashboardState> {
    const [
      leaseStats,
      capacitySummary,
      checkpointStats,
      activeLeases,
      recentEvents,
      gpuUtilization,
      tenantUsage,
      costAnalytics,
      checkpointAnalytics,
      gkeNodes,
    ] = await Promise.all([
      getLeaseStats(),
      getCapacitySummary(),
      getCheckpointStats(),
      getLeasesByStatus(LeaseStatus.ACTIVE),
      getRecentAuditEvents(20),
      getGpuUtilization(),
      getLeasesByTenant(),
      getCostAnalytics(),
      getCheckpointAnalytics(),
      getGkeNodeStatus(),
    ]);

    // Resolve tenant names
    const tenantBreakdown = await Promise.all(
      tenantUsage.slice(0, 10).map(async (t) => {
        let tenantName = t.tenantId;
        if (t.tenantId && t.tenantId !== "unknown") {
          try {
            const tenant = await getTenant(t.tenantId);
            tenantName = tenant?.name ?? t.tenantId;
          } catch {
            // Keep the ID if lookup fails
          }
        }
        return {
          tenantId: t.tenantId,
          tenantName,
          activeLeases: t.activeLeases,
          totalLeases: t.totalLeases,
          totalSavingsUsd: t.totalSavingsUsd,
        };
      })
    );

    const savingsPercent =
      costAnalytics.totalBaselineCostUsd > 0
        ? (costAnalytics.totalSavingsUsd / costAnalytics.totalBaselineCostUsd) * 100
        : 0;

    return {
      stats: {
        activeLeases: leaseStats.active,
        pendingRequests: leaseStats.pending,
        totalSavingsUsd: leaseStats.totalSavingsUsd,
        checkpointsCompleted: checkpointStats.complete,
      },
      capacity: {
        total: capacitySummary.total,
        available: capacitySummary.available,
        leased: capacitySummary.leased,
        byGpuType: capacitySummary.byGpuType,
      },
      leases: activeLeases.map((l) => ({
        id: l.id,
        status: l.status,
        agentId: l.tenantAgentId,
        gpuType: l.gpuType,
        capacityLane: l.capacityLane,
        grantedAt: l.grantedAt?.toISOString() ?? null,
      })),
      events: recentEvents.map((e) => ({
        id: e.id,
        type: e.eventType,
        timestamp: e.timestamp.toISOString(),
        summary: e.reasoning ?? e.eventType.replace(/_/g, " "),
        leaseId: e.leaseId,
      })),
      gpuUtilization: gpuUtilization.map((g) => ({
        id: g.id,
        instanceName: g.instanceName,
        gpuType: g.gpuType,
        gpuIndex: g.gpuIndex,
        status: g.status,
        utilizationPercent: g.utilizationPercent,
        memoryGb: g.memoryGb,
        currentLeaseId: g.currentLeaseId,
      })),
      tenantBreakdown,
      costAnalytics: {
        hourly: costAnalytics.hourly,
        daily: costAnalytics.daily,
        totalBaselineCostUsd: costAnalytics.totalBaselineCostUsd,
        totalActualCostUsd: costAnalytics.totalActualCostUsd,
        totalSavingsUsd: costAnalytics.totalSavingsUsd,
        savingsPercent: Math.round(savingsPercent * 100) / 100,
      },
      checkpointAnalytics: {
        total: checkpointAnalytics.total,
        complete: checkpointAnalytics.complete,
        restored: checkpointAnalytics.restored,
        failed: checkpointAnalytics.failed,
        successRate: checkpointAnalytics.successRate,
        avgSizeBytes: checkpointAnalytics.avgSizeBytes,
        avgDurationMs: checkpointAnalytics.avgDurationMs,
        recentCheckpoints: checkpointAnalytics.recentCheckpoints,
      },
      gkeNodes: gkeNodes.map((n) => ({
        nodeName: n.nodeName,
        nodePool: n.nodePool,
        zone: n.zone,
        gpuCount: n.gpuCount,
        gpuType: n.gpuType,
        status: n.status,
        totalUtilization: n.totalUtilization,
        gpus: n.gpus.map((g) => ({
          gpuIndex: g.gpuIndex,
          status: g.status,
          utilizationPercent: g.utilizationPercent,
        })),
      })),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Send state to a specific client.
   */
  private async sendState(ws: WebSocket): Promise<void> {
    try {
      const state = await this.getState();
      ws.send(JSON.stringify({ type: "state", data: state }));
    } catch (error) {
      log.error("Failed to send state", { error: (error as Error).message });
    }
  }

  /**
   * Broadcast state to all connected clients.
   */
  private async broadcastState(): Promise<void> {
    if (this.clients.size === 0) return;

    try {
      const state = await this.getState();
      const message = JSON.stringify({ type: "state", data: state });

      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      }
    } catch (error) {
      log.error("Failed to broadcast state", { error: (error as Error).message });
    }
  }

  /**
   * Get the dashboard HTML.
   */
  private getDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Xid-R Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      padding: 20px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid #334155;
    }
    .header h1 { font-size: 24px; font-weight: 600; color: #38bdf8; }
    .header .status { display: flex; align-items: center; gap: 8px; font-size: 14px; }
    .header .status .dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
    .header .status.disconnected .dot { background: #ef4444; }

    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .grid-6 { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; }
    .stat-card .label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .stat-card .value { font-size: 32px; font-weight: 700; color: #f1f5f9; }
    .stat-card .value.small { font-size: 24px; }
    .stat-card .value.savings { color: #22c55e; }
    .stat-card .value.savings::before { content: '$'; }
    .stat-card .subtext { font-size: 12px; color: #64748b; margin-top: 4px; }

    .section-title { font-size: 16px; font-weight: 600; color: #94a3b8; margin: 24px 0 16px 0; text-transform: uppercase; letter-spacing: 1px; }

    .panels { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .panels-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .panel { background: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; }
    .panel.full-width { grid-column: span 2; }
    .panel-header { padding: 16px 20px; border-bottom: 1px solid #334155; font-weight: 600; font-size: 14px; display: flex; justify-content: space-between; align-items: center; }
    .panel-header .badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: #334155; }
    .panel-content { padding: 16px 20px; max-height: 350px; overflow-y: auto; }

    .item { padding: 12px; background: #0f172a; border-radius: 8px; margin-bottom: 8px; font-size: 13px; }
    .item:last-child { margin-bottom: 0; }
    .item .id { font-family: monospace; color: #38bdf8; font-weight: 600; }
    .item .meta { color: #94a3b8; margin-top: 4px; }
    .item .status { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; text-transform: uppercase; font-weight: 600; }
    .item .status.active, .item .status.healthy { background: #166534; color: #86efac; }
    .item .status.pending, .item .status.degraded { background: #854d0e; color: #fde047; }
    .item .status.negotiating { background: #7c2d12; color: #fdba74; }
    .item .status.leased { background: #1e40af; color: #93c5fd; }
    .item .status.available, .item .status.complete { background: #166534; color: #86efac; }
    .item .status.offline, .item .status.failed { background: #7f1d1d; color: #fca5a5; }
    .item .status.harvestable { background: #4c1d95; color: #c4b5fd; }

    .event-item .event-type { color: #a78bfa; font-weight: 500; }
    .event-item .event-time { color: #64748b; font-size: 11px; }
    .event-item .event-summary { color: #cbd5e1; margin-top: 4px; }

    .capacity-bar, .progress-bar { display: flex; height: 24px; border-radius: 6px; overflow: hidden; background: #0f172a; margin-top: 12px; }
    .capacity-bar .segment, .progress-bar .segment { display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; }
    .capacity-bar .leased { background: #3b82f6; }
    .capacity-bar .available { background: #22c55e; }

    .utilization-bar { height: 8px; background: #334155; border-radius: 4px; overflow: hidden; margin-top: 8px; }
    .utilization-bar .fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
    .utilization-bar .fill.low { background: #22c55e; }
    .utilization-bar .fill.medium { background: #eab308; }
    .utilization-bar .fill.high { background: #ef4444; }

    .gpu-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .gpu-card { background: #0f172a; border-radius: 8px; padding: 14px; border: 1px solid #334155; }
    .gpu-card .gpu-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .gpu-card .gpu-name { font-weight: 600; color: #f1f5f9; font-size: 13px; }
    .gpu-card .gpu-type { font-size: 11px; color: #94a3b8; }
    .gpu-card .gpu-util { font-size: 20px; font-weight: 700; }
    .gpu-card .gpu-util.low { color: #22c55e; }
    .gpu-card .gpu-util.medium { color: #eab308; }
    .gpu-card .gpu-util.high { color: #ef4444; }

    .tenant-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #0f172a; border-radius: 6px; margin-bottom: 6px; }
    .tenant-row:last-child { margin-bottom: 0; }
    .tenant-row .tenant-name { font-weight: 500; color: #f1f5f9; }
    .tenant-row .tenant-stats { display: flex; gap: 16px; font-size: 12px; color: #94a3b8; }
    .tenant-row .tenant-stats .stat-value { color: #f1f5f9; font-weight: 600; }

    .cost-chart { height: 120px; display: flex; align-items: flex-end; gap: 4px; padding: 12px 0; }
    .cost-chart .bar { flex: 1; background: #3b82f6; border-radius: 4px 4px 0 0; min-height: 4px; position: relative; }
    .cost-chart .bar:hover { background: #60a5fa; }
    .cost-chart .bar .tooltip { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: #1e293b; padding: 4px 8px; border-radius: 4px; font-size: 11px; white-space: nowrap; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
    .cost-chart .bar:hover .tooltip { opacity: 1; }

    .checkpoint-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #0f172a; border-radius: 6px; margin-bottom: 6px; }
    .checkpoint-item .ckpt-info { display: flex; flex-direction: column; gap: 2px; }
    .checkpoint-item .ckpt-id { font-family: monospace; font-size: 12px; color: #38bdf8; }
    .checkpoint-item .ckpt-meta { font-size: 11px; color: #94a3b8; }
    .checkpoint-item .ckpt-stats { text-align: right; font-size: 12px; }

    .node-card { background: #0f172a; border-radius: 8px; padding: 14px; border: 1px solid #334155; margin-bottom: 12px; }
    .node-card:last-child { margin-bottom: 0; }
    .node-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .node-name { font-weight: 600; color: #f1f5f9; }
    .node-meta { font-size: 12px; color: #94a3b8; }
    .node-gpus { display: flex; gap: 8px; flex-wrap: wrap; }
    .node-gpu { padding: 6px 10px; background: #1e293b; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; }
    .node-gpu .gpu-dot { width: 8px; height: 8px; border-radius: 50%; }
    .node-gpu .gpu-dot.available { background: #22c55e; }
    .node-gpu .gpu-dot.leased { background: #3b82f6; }
    .node-gpu .gpu-dot.draining { background: #f59e0b; }

    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .updating { animation: pulse 1s ease-in-out infinite; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Xid-R Dashboard</h1>
    <div class="status" id="connection-status">
      <span class="dot"></span>
      <span>Connected</span>
    </div>
  </div>

  <!-- Main Stats -->
  <div class="grid-6">
    <div class="stat-card">
      <div class="label">Active Leases</div>
      <div class="value" id="active-leases">-</div>
    </div>
    <div class="stat-card">
      <div class="label">Pending</div>
      <div class="value" id="pending-requests">-</div>
    </div>
    <div class="stat-card">
      <div class="label">Total Savings</div>
      <div class="value savings" id="total-savings">0.00</div>
    </div>
    <div class="stat-card">
      <div class="label">Savings Rate</div>
      <div class="value small" id="savings-rate">-</div>
      <div class="subtext">vs on-demand</div>
    </div>
    <div class="stat-card">
      <div class="label">Checkpoints</div>
      <div class="value" id="checkpoints">-</div>
    </div>
    <div class="stat-card">
      <div class="label">Success Rate</div>
      <div class="value small" id="checkpoint-success">-</div>
    </div>
  </div>

  <!-- Capacity Overview -->
  <div class="panel" style="margin-bottom: 24px;">
    <div class="panel-header">Capacity Overview</div>
    <div class="panel-content">
      <div id="capacity-summary"></div>
      <div class="capacity-bar" id="capacity-bar"></div>
    </div>
  </div>

  <!-- GPU Utilization Section -->
  <div class="section-title">GPU Utilization</div>
  <div class="panel" style="margin-bottom: 24px;">
    <div class="panel-header">
      <span>Real-time GPU Metrics</span>
      <span class="badge" id="gpu-count">0 GPUs</span>
    </div>
    <div class="panel-content" style="max-height: 300px;">
      <div class="gpu-grid" id="gpu-grid">
        <div class="item">Loading...</div>
      </div>
    </div>
  </div>

  <!-- GKE Nodes Section -->
  <div class="section-title">GKE Node Status</div>
  <div class="panel" style="margin-bottom: 24px;">
    <div class="panel-header">
      <span>Cluster Nodes</span>
      <span class="badge" id="node-count">0 Nodes</span>
    </div>
    <div class="panel-content" id="gke-nodes">
      <div class="item">Loading...</div>
    </div>
  </div>

  <!-- Cost Analytics & Tenants -->
  <div class="section-title">Analytics</div>
  <div class="panels-3">
    <div class="panel">
      <div class="panel-header">Cost Savings (Daily)</div>
      <div class="panel-content">
        <div class="cost-chart" id="daily-chart"></div>
        <div id="cost-summary" style="font-size: 12px; color: #94a3b8; margin-top: 8px;"></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">Tenant Usage</div>
      <div class="panel-content" id="tenant-list">
        <div class="item">Loading...</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">Checkpoint Analytics</div>
      <div class="panel-content" id="checkpoint-analytics">
        <div class="item">Loading...</div>
      </div>
    </div>
  </div>

  <!-- Active Leases & Events -->
  <div class="section-title">Activity</div>
  <div class="panels">
    <div class="panel">
      <div class="panel-header">Active Leases</div>
      <div class="panel-content" id="leases-list">
        <div class="item">Loading...</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">Recent Events</div>
      <div class="panel-content" id="events-list">
        <div class="item">Loading...</div>
      </div>
    </div>
  </div>

  <script>
    let ws;
    let reconnectAttempts = 0;

    function connect() {
      ws = new WebSocket('ws://' + window.location.host);
      ws.onopen = () => {
        document.getElementById('connection-status').classList.remove('disconnected');
        reconnectAttempts = 0;
      };
      ws.onclose = () => {
        document.getElementById('connection-status').classList.add('disconnected');
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;
        setTimeout(connect, delay);
      };
      ws.onerror = (err) => console.error('WebSocket error:', err);
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'state') updateDashboard(message.data);
      };
    }

    function getUtilClass(pct) {
      if (pct < 30) return 'low';
      if (pct < 70) return 'medium';
      return 'high';
    }

    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function formatDuration(ms) {
      if (ms < 1000) return ms + 'ms';
      return (ms / 1000).toFixed(2) + 's';
    }

    function updateDashboard(state) {
      // Main stats
      document.getElementById('active-leases').textContent = state.stats.activeLeases;
      document.getElementById('pending-requests').textContent = state.stats.pendingRequests;
      document.getElementById('total-savings').textContent = state.stats.totalSavingsUsd.toFixed(4);
      document.getElementById('checkpoints').textContent = state.stats.checkpointsCompleted;
      document.getElementById('savings-rate').textContent = state.costAnalytics.savingsPercent.toFixed(1) + '%';
      document.getElementById('checkpoint-success').textContent = state.checkpointAnalytics.successRate.toFixed(1) + '%';

      // Capacity bar
      const { total, available, leased } = state.capacity;
      document.getElementById('capacity-summary').innerHTML =
        \`<span>Total: <strong>\${total}</strong></span> | <span>Available: <strong>\${available}</strong></span> | <span>Leased: <strong>\${leased}</strong></span>\`;
      if (total > 0) {
        document.getElementById('capacity-bar').innerHTML = \`
          <div class="segment leased" style="width: \${(leased/total)*100}%">\${leased} leased</div>
          <div class="segment available" style="width: \${(available/total)*100}%">\${available} available</div>
        \`;
      }

      // GPU Utilization
      document.getElementById('gpu-count').textContent = state.gpuUtilization.length + ' GPUs';
      if (state.gpuUtilization.length === 0) {
        document.getElementById('gpu-grid').innerHTML = '<div class="item">No GPUs discovered</div>';
      } else {
        document.getElementById('gpu-grid').innerHTML = state.gpuUtilization.map(gpu => \`
          <div class="gpu-card">
            <div class="gpu-header">
              <div>
                <div class="gpu-name">\${gpu.instanceName || gpu.id}</div>
                <div class="gpu-type">\${gpu.gpuType} • \${gpu.memoryGb}GB</div>
              </div>
              <div class="gpu-util \${getUtilClass(gpu.utilizationPercent)}">\${gpu.utilizationPercent.toFixed(0)}%</div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8;">
              <span class="status \${gpu.status}">\${gpu.status}</span>
              <span>GPU #\${gpu.gpuIndex}</span>
            </div>
            <div class="utilization-bar">
              <div class="fill \${getUtilClass(gpu.utilizationPercent)}" style="width: \${gpu.utilizationPercent}%"></div>
            </div>
          </div>
        \`).join('');
      }

      // GKE Nodes
      document.getElementById('node-count').textContent = state.gkeNodes.length + ' Nodes';
      if (state.gkeNodes.length === 0) {
        document.getElementById('gke-nodes').innerHTML = '<div class="item">No GKE nodes discovered (set USE_REAL_GKE=true)</div>';
      } else {
        document.getElementById('gke-nodes').innerHTML = state.gkeNodes.map(node => \`
          <div class="node-card">
            <div class="node-header">
              <div>
                <div class="node-name">\${node.nodeName}</div>
                <div class="node-meta">\${node.nodePool || 'default'} • \${node.zone} • \${node.gpuType}</div>
              </div>
              <span class="status \${node.status}">\${node.status}</span>
            </div>
            <div class="node-gpus">
              \${node.gpus.map(gpu => \`
                <div class="node-gpu">
                  <div class="gpu-dot \${gpu.status}"></div>
                  <span>GPU #\${gpu.gpuIndex}: \${gpu.utilizationPercent.toFixed(0)}%</span>
                </div>
              \`).join('')}
            </div>
          </div>
        \`).join('');
      }

      // Daily cost chart
      const daily = state.costAnalytics.daily;
      const maxSavings = Math.max(...daily.map(d => d.savingsUsd), 0.01);
      document.getElementById('daily-chart').innerHTML = daily.length === 0
        ? '<div style="color: #64748b; font-size: 12px;">No data yet</div>'
        : daily.map(d => \`
          <div class="bar" style="height: \${Math.max((d.savingsUsd/maxSavings)*100, 5)}%">
            <div class="tooltip">\${d.date}: $\${d.savingsUsd.toFixed(4)} (\${d.leaseCount} leases)</div>
          </div>
        \`).join('');
      document.getElementById('cost-summary').innerHTML = \`
        Baseline: <strong>$\${state.costAnalytics.totalBaselineCostUsd.toFixed(4)}</strong> |
        Actual: <strong>$\${state.costAnalytics.totalActualCostUsd.toFixed(4)}</strong> |
        Saved: <strong style="color: #22c55e;">$\${state.costAnalytics.totalSavingsUsd.toFixed(4)}</strong>
      \`;

      // Tenant breakdown
      if (state.tenantBreakdown.length === 0) {
        document.getElementById('tenant-list').innerHTML = '<div class="item">No tenant data</div>';
      } else {
        document.getElementById('tenant-list').innerHTML = state.tenantBreakdown.map(t => \`
          <div class="tenant-row">
            <div class="tenant-name">\${t.tenantName}</div>
            <div class="tenant-stats">
              <span>Active: <span class="stat-value">\${t.activeLeases}</span></span>
              <span>Total: <span class="stat-value">\${t.totalLeases}</span></span>
              <span>Saved: <span class="stat-value" style="color: #22c55e;">$\${t.totalSavingsUsd.toFixed(4)}</span></span>
            </div>
          </div>
        \`).join('');
      }

      // Checkpoint analytics
      const ca = state.checkpointAnalytics;
      document.getElementById('checkpoint-analytics').innerHTML = \`
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
          <div class="item" style="text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #22c55e;">\${ca.complete + ca.restored}</div>
            <div style="font-size: 11px; color: #94a3b8;">Successful</div>
          </div>
          <div class="item" style="text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #ef4444;">\${ca.failed}</div>
            <div style="font-size: 11px; color: #94a3b8;">Failed</div>
          </div>
        </div>
        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 12px;">
          Avg Size: <strong>\${formatBytes(ca.avgSizeBytes)}</strong> |
          Avg Duration: <strong>\${formatDuration(ca.avgDurationMs)}</strong>
        </div>
        <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">Recent Checkpoints</div>
        \${ca.recentCheckpoints.slice(0, 5).map(ckpt => \`
          <div class="checkpoint-item">
            <div class="ckpt-info">
              <div class="ckpt-id">\${ckpt.leaseId}</div>
              <div class="ckpt-meta">\${new Date(ckpt.createdAt).toLocaleTimeString()}</div>
            </div>
            <div class="ckpt-stats">
              <span class="status \${ckpt.status}">\${ckpt.status}</span>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">\${formatBytes(ckpt.sizeBytes)} • \${formatDuration(ckpt.durationMs)}</div>
            </div>
          </div>
        \`).join('')}
      \`;

      // Active Leases
      if (state.leases.length === 0) {
        document.getElementById('leases-list').innerHTML = '<div class="item">No active leases</div>';
      } else {
        document.getElementById('leases-list').innerHTML = state.leases.map(lease => \`
          <div class="item">
            <div><span class="id">\${lease.id}</span> <span class="status \${lease.status}">\${lease.status}</span></div>
            <div class="meta">Agent: \${lease.agentId} | GPU: \${lease.gpuType} | Lane: \${lease.capacityLane || 'pending'}</div>
          </div>
        \`).join('');
      }

      // Events
      if (state.events.length === 0) {
        document.getElementById('events-list').innerHTML = '<div class="item">No recent events</div>';
      } else {
        document.getElementById('events-list').innerHTML = state.events.slice(0, 10).map(event => \`
          <div class="item event-item">
            <div><span class="event-type">\${event.type.replace(/_/g, ' ')}</span> <span class="event-time">\${new Date(event.timestamp).toLocaleTimeString()}</span></div>
            <div class="event-summary">\${event.summary}</div>
          </div>
        \`).join('');
      }
    }

    connect();
  </script>
</body>
</html>`;
  }
}

// Main entry point
export async function run(): Promise<void> {
  log.info("Starting Dashboard Server");

  // Initialize Firestore
  initFirestore();

  const dashboard = new DashboardServer();

  process.on("SIGINT", () => {
    log.info("Shutting down");
    dashboard.stop();
    process.exit(0);
  });

  await dashboard.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    log.error("Dashboard failed", { error: err.message });
    process.exit(1);
  });
}
