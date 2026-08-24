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
import { getLeaseStats, getLeasesByStatus } from "../db/leases.js";
import { getCapacitySummary, getAllCapacityUnits } from "../db/capacity.js";
import { getCheckpointStats } from "../db/checkpoints.js";
import { getRecentAuditEvents } from "../db/audit.js";
import { LeaseStatus } from "../models/lease.js";

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
    const [leaseStats, capacitySummary, checkpointStats, activeLeases, recentEvents] =
      await Promise.all([
        getLeaseStats(),
        getCapacitySummary(),
        getCheckpointStats(),
        getLeasesByStatus(LeaseStatus.ACTIVE),
        getRecentAuditEvents(20),
      ]);

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
    .header h1 {
      font-size: 24px;
      font-weight: 600;
      color: #38bdf8;
    }
    .header .status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }
    .header .status .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
    }
    .header .status.disconnected .dot { background: #ef4444; }

    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: #1e293b;
      border-radius: 12px;
      padding: 20px;
      border: 1px solid #334155;
    }
    .stat-card .label {
      font-size: 12px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .stat-card .value {
      font-size: 32px;
      font-weight: 700;
      color: #f1f5f9;
    }
    .stat-card .value.savings {
      color: #22c55e;
    }
    .stat-card .value.savings::before {
      content: '$';
    }

    .panels {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .panel {
      background: #1e293b;
      border-radius: 12px;
      border: 1px solid #334155;
      overflow: hidden;
    }
    .panel-header {
      padding: 16px 20px;
      border-bottom: 1px solid #334155;
      font-weight: 600;
      font-size: 14px;
    }
    .panel-content {
      padding: 16px 20px;
      max-height: 400px;
      overflow-y: auto;
    }

    .lease-item, .event-item {
      padding: 12px;
      background: #0f172a;
      border-radius: 8px;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .lease-item:last-child, .event-item:last-child {
      margin-bottom: 0;
    }
    .lease-item .lease-id {
      font-family: monospace;
      color: #38bdf8;
      font-weight: 600;
    }
    .lease-item .meta {
      color: #94a3b8;
      margin-top: 4px;
    }
    .lease-item .status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .lease-item .status.active { background: #166534; color: #86efac; }
    .lease-item .status.pending { background: #854d0e; color: #fde047; }
    .lease-item .status.negotiating { background: #7c2d12; color: #fdba74; }

    .event-item .event-type {
      color: #a78bfa;
      font-weight: 500;
    }
    .event-item .event-time {
      color: #64748b;
      font-size: 11px;
    }
    .event-item .event-summary {
      color: #cbd5e1;
      margin-top: 4px;
    }

    .capacity-bar {
      display: flex;
      height: 24px;
      border-radius: 6px;
      overflow: hidden;
      background: #0f172a;
      margin-top: 12px;
    }
    .capacity-bar .segment {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
    }
    .capacity-bar .leased { background: #3b82f6; }
    .capacity-bar .available { background: #22c55e; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
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

  <div class="grid">
    <div class="stat-card">
      <div class="label">Active Leases</div>
      <div class="value" id="active-leases">-</div>
    </div>
    <div class="stat-card">
      <div class="label">Pending Requests</div>
      <div class="value" id="pending-requests">-</div>
    </div>
    <div class="stat-card">
      <div class="label">Total Savings</div>
      <div class="value savings" id="total-savings">0.00</div>
    </div>
    <div class="stat-card">
      <div class="label">Checkpoints</div>
      <div class="value" id="checkpoints">-</div>
    </div>
  </div>

  <div class="panel" style="margin-bottom: 16px;">
    <div class="panel-header">Capacity Overview</div>
    <div class="panel-content">
      <div id="capacity-summary"></div>
      <div class="capacity-bar" id="capacity-bar"></div>
    </div>
  </div>

  <div class="panels">
    <div class="panel">
      <div class="panel-header">Active Leases</div>
      <div class="panel-content" id="leases-list">
        <div class="lease-item">Loading...</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">Recent Events</div>
      <div class="panel-content" id="events-list">
        <div class="event-item">Loading...</div>
      </div>
    </div>
  </div>

  <script>
    let ws;
    let reconnectAttempts = 0;

    function connect() {
      ws = new WebSocket('ws://' + window.location.host);

      ws.onopen = () => {
        console.log('Connected to dashboard');
        document.getElementById('connection-status').classList.remove('disconnected');
        reconnectAttempts = 0;
      };

      ws.onclose = () => {
        console.log('Disconnected from dashboard');
        document.getElementById('connection-status').classList.add('disconnected');

        // Reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;
        setTimeout(connect, delay);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'state') {
          updateDashboard(message.data);
        }
      };
    }

    function updateDashboard(state) {
      // Update stats
      document.getElementById('active-leases').textContent = state.stats.activeLeases;
      document.getElementById('pending-requests').textContent = state.stats.pendingRequests;
      document.getElementById('total-savings').textContent = state.stats.totalSavingsUsd.toFixed(4);
      document.getElementById('checkpoints').textContent = state.stats.checkpointsCompleted;

      // Update capacity
      const { total, available, leased } = state.capacity;
      document.getElementById('capacity-summary').innerHTML =
        \`<span>Total: <strong>\${total}</strong></span> |
         <span>Available: <strong>\${available}</strong></span> |
         <span>Leased: <strong>\${leased}</strong></span>\`;

      const bar = document.getElementById('capacity-bar');
      if (total > 0) {
        const leasedPct = (leased / total) * 100;
        const availablePct = (available / total) * 100;
        bar.innerHTML = \`
          <div class="segment leased" style="width: \${leasedPct}%">\${leased} leased</div>
          <div class="segment available" style="width: \${availablePct}%">\${available} available</div>
        \`;
      }

      // Update leases
      const leasesList = document.getElementById('leases-list');
      if (state.leases.length === 0) {
        leasesList.innerHTML = '<div class="lease-item">No active leases</div>';
      } else {
        leasesList.innerHTML = state.leases.map(lease => \`
          <div class="lease-item">
            <div>
              <span class="lease-id">\${lease.id}</span>
              <span class="status \${lease.status}">\${lease.status}</span>
            </div>
            <div class="meta">
              Agent: \${lease.agentId} | GPU: \${lease.gpuType} | Lane: \${lease.capacityLane || 'pending'}
            </div>
          </div>
        \`).join('');
      }

      // Update events
      const eventsList = document.getElementById('events-list');
      if (state.events.length === 0) {
        eventsList.innerHTML = '<div class="event-item">No recent events</div>';
      } else {
        eventsList.innerHTML = state.events.slice(0, 10).map(event => \`
          <div class="event-item">
            <div>
              <span class="event-type">\${event.type.replace(/_/g, ' ')}</span>
              <span class="event-time">\${new Date(event.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="event-summary">\${event.summary}</div>
          </div>
        \`).join('');
      }
    }

    // Initial connection
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

export { DashboardServer };
