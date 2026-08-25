/**
 * Xid-R - Agentic GPU Compute Broker
 *
 * Unified server entry point that provides:
 * - REST API endpoints (MCP tools, leases, capacity, agents, system)
 * - WebSocket server for real-time dashboard updates
 * - All metrics and analytics on a single port
 */

import { createServer } from "http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { WebSocketServer, WebSocket } from "ws";

import { getConfig } from "./config.js";
import { initFirestore } from "./db/firestore.js";
import { createLogger } from "./utils/logger.js";
import { generateRequestId } from "./utils/ids.js";

// Import routes
import { mcpRoutes } from "./api/routes/mcp.js";
import { leaseRoutes } from "./api/routes/leases.js";
import { capacityRoutes } from "./api/routes/capacity.js";
import { agentRoutes } from "./api/routes/agents.js";
import { systemRoutes } from "./api/routes/system.js";
import { tenantRoutes } from "./api/routes/tenants.js";
import { onboardingRoutes } from "./api/routes/onboarding.js";
import { approvalsRoutes, ruleSetRoutes } from "./api/routes/approvals.js";

// Import middleware
import { devAuthBypass, optionalAuthMiddleware, rateLimitMiddleware } from "./middleware/auth.js";

// Import database functions for WebSocket state
import { getLeaseStats, getLeasesByStatus, getLeasesByTenant, getCostAnalytics } from "./db/leases.js";
import { getCapacitySummary, getGpuUtilization, getGkeNodeStatus } from "./db/capacity.js";
import { getCheckpointStats, getCheckpointAnalytics } from "./db/checkpoints.js";
import { getRecentAuditEvents } from "./db/audit.js";
import { getTenant } from "./db/tenants.js";
import { LeaseStatus } from "./models/lease.js";

const log = createLogger({ module: "server" });

// ============================================================================
// Re-exports for library usage
// ============================================================================

export * from "./config.js";
export * from "./models/index.js";
export * from "./db/index.js";
export * from "./utils/index.js";

// Agents
export { SchedulerAgent } from "./agents/scheduler.js";
export { NegotiatorAgent, getNegotiator } from "./agents/negotiator.js";

// Capacity
export { CapacityFabric, getCapacityFabric } from "./capacity/fabric.js";
export { PreemptionHandler, getPreemptionHandler } from "./capacity/preemption.js";

// Checkpoint SDK
export {
  CheckpointHelper,
  CheckpointableAgent,
  MockCheckpointHelper,
  type XidrCheckpointable,
  type CheckpointResult,
  type RestoreResult,
} from "./checkpoint/sdk.js";

// Version
export const VERSION = "0.1.0";

// ============================================================================
// Dashboard State Interface
// ============================================================================

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

// ============================================================================
// WebSocket Manager
// ============================================================================

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private updateInterval: NodeJS.Timeout | null = null;
  private config = getConfig();

  /**
   * Attach WebSocket server to HTTP server.
   */
  attach(server: ReturnType<typeof createServer>): void {
    this.wss = new WebSocketServer({ server });

    this.wss.on("connection", (ws) => {
      log.info("WebSocket client connected", { totalClients: this.clients.size + 1 });
      this.clients.add(ws);

      // Send initial state
      this.sendState(ws);

      ws.on("close", () => {
        log.info("WebSocket client disconnected", { totalClients: this.clients.size - 1 });
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

    log.info("WebSocket server attached", { updateIntervalMs: this.config.dashboard.updateIntervalMs });
  }

  /**
   * Stop WebSocket server.
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
    log.info("WebSocket server stopped");
  }

  /**
   * Get current dashboard state from all data sources.
   */
  async getState(): Promise<DashboardState> {
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
   * Get client count.
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

// ============================================================================
// Create Hono App with all routes
// ============================================================================

export function createApp(wsManager: WebSocketManager) {
  const app = new Hono();
  const config = getConfig();

  // Middleware
  app.use("*", cors({
    origin: config.api.corsOrigins,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Request-ID"],
  }));

  app.use("*", honoLogger());
  app.use("*", prettyJSON());

  // Request ID middleware
  app.use("*", async (c, next) => {
    const requestId = c.req.header("X-Request-ID") ?? generateRequestId();
    c.set("requestId", requestId);
    c.header("X-Request-ID", requestId);
    await next();
  });

  // Health check
  app.get("/health", (c) => c.json({
    status: "ok",
    version: VERSION,
    websocketClients: wsManager.getClientCount(),
  }));

  // Dashboard state endpoint (for REST fallback)
  app.get("/api/state", async (c) => {
    const state = await wsManager.getState();
    return c.json(state);
  });

  // Optional auth + rate limiting for all API routes
  app.use("/api/*", optionalAuthMiddleware(), rateLimitMiddleware());
  app.use("/mcp/*", optionalAuthMiddleware());

  // Dev mode: bypass auth for local development
  if (config.environment === "development") {
    app.use("/mcp/*", devAuthBypass());
    app.use("/api/*", devAuthBypass());
    log.warn("Development mode: auth bypass enabled");
  }

  // Mount routes
  app.route("/mcp", mcpRoutes);
  app.route("/api/leases", leaseRoutes);
  app.route("/api/capacity", capacityRoutes);
  app.route("/api/agents", agentRoutes);
  app.route("/api/system", systemRoutes);
  app.route("/api/tenants", tenantRoutes);

  // Enterprise onboarding routes
  app.route("/api/onboarding", onboardingRoutes);
  app.route("/api/rule-sets", ruleSetRoutes);
  app.route("/api/approvals", approvalsRoutes);

  // 404 handler
  app.notFound((c) => {
    return c.json({ error: "Not found", path: c.req.path }, 404);
  });

  // Error handler
  app.onError((err, c) => {
    log.error("Request error", {
      error: err.message,
      path: c.req.path,
      requestId: c.get("requestId"),
    });
    return c.json({ error: err.message }, 500);
  });

  return app;
}

// ============================================================================
// Main Server
// ============================================================================

export async function startServer(): Promise<void> {
  const config = getConfig();

  log.info("Starting Xid-R server...");

  // Initialize Firestore
  initFirestore();

  // Create WebSocket manager
  const wsManager = new WebSocketManager();

  // Create Hono app
  const app = createApp(wsManager);

  // Create HTTP server
  const server = createServer(async (req, res) => {
    // Skip WebSocket upgrade requests - let WebSocketServer handle them
    if (req.headers.upgrade?.toLowerCase() === "websocket") {
      return;
    }

    // Handle requests through Hono
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
    }

    // Read body for POST/PUT requests
    let body: string | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks).toString();
    }

    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body,
    });

    const response = await app.fetch(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const responseBody = await response.text();
    res.end(responseBody);
  });

  // Attach WebSocket to the same server
  wsManager.attach(server);

  // Start server
  server.listen(config.api.port, config.api.host, () => {
    log.info("=".repeat(60));
    log.info("Xid-R Server Started");
    log.info("=".repeat(60));
    log.info(`Environment: ${config.environment}`);
    log.info(`Host: ${config.api.host}`);
    log.info(`Port: ${config.api.port}`);
    log.info("");
    log.info("Endpoints:");
    log.info(`  REST API:   http://${config.api.host}:${config.api.port}/api`);
    log.info(`  MCP Tools:  http://${config.api.host}:${config.api.port}/mcp`);
    log.info(`  WebSocket:  ws://${config.api.host}:${config.api.port}`);
    log.info(`  Health:     http://${config.api.host}:${config.api.port}/health`);
    log.info(`  State:      http://${config.api.host}:${config.api.port}/api/state`);
    log.info("=".repeat(60));
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    log.info(`Received ${signal}, shutting down...`);
    wsManager.stop();
    server.close(() => {
      log.info("Server stopped");
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err) => {
    log.error("Failed to start server", { error: err.message });
    process.exit(1);
  });
}
