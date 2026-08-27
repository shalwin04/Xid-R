/**
 * Xid-R API Server - Self-Service Surface
 *
 * Provides MCP-compatible HTTP endpoints for GPU capacity brokering.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";

import { getConfig } from "../config.js";
import { initFirestore } from "../db/firestore.js";
import { createLogger } from "../utils/logger.js";
import { generateRequestId } from "../utils/ids.js";

// Import routes
import { mcpRoutes } from "./routes/mcp.js";
import { leaseRoutes } from "./routes/leases.js";
import { capacityRoutes } from "./routes/capacity.js";
import { agentRoutes } from "./routes/agents.js";
import { systemRoutes } from "./routes/system.js";
import { tenantRoutes } from "./routes/tenants.js";
import { approvalsRoutes, ruleSetRoutes } from "./routes/approvals.js";
import installRoutes from "./routes/install.js";
import { onboardingRoutes } from "./routes/onboarding.js";
import { chatRoutes } from "./routes/chat.js";

// Import middleware
import { devAuthBypass, optionalAuthMiddleware, rateLimitMiddleware } from "../middleware/auth.js";

const log = createLogger({ module: "api" });

export function createApp() {
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
  app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

  // Optional auth + rate limiting for all API routes
  // Apply auth first, then dev bypass only if no auth provided
  app.use("/api/*", optionalAuthMiddleware(), rateLimitMiddleware());
  app.use("/mcp/*", optionalAuthMiddleware());

  // Dev mode: bypass auth for local development (only if no auth provided)
  if (config.environment === "development") {
    app.use("/mcp/*", devAuthBypass());
    app.use("/api/*", devAuthBypass());
    log.warn("Development mode: auth bypass enabled for unauthenticated requests");
  }

  // Mount routes
  app.route("/mcp", mcpRoutes);
  app.route("/api/leases", leaseRoutes);
  app.route("/api/capacity", capacityRoutes);
  app.route("/api/agents", agentRoutes);
  app.route("/api/system", systemRoutes);
  app.route("/api/tenants", tenantRoutes);
  app.route("/api/rule-sets", ruleSetRoutes);
  app.route("/api/approvals", approvalsRoutes);
  app.route("/api/onboarding", onboardingRoutes);
  app.route("/api/chat", chatRoutes);
  app.route("/install", installRoutes);

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

export async function startServer() {
  const config = getConfig();

  // Initialize Firestore
  initFirestore();

  const app = createApp();

  log.info("Starting Xid-R API server", {
    host: config.api.host,
    port: config.api.port,
    environment: config.environment,
  });

  serve({
    fetch: app.fetch,
    port: config.api.port,
    hostname: config.api.host,
  });

  log.info(`Server listening on http://${config.api.host}:${config.api.port}`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err) => {
    log.error("Failed to start server", { error: err.message });
    process.exit(1);
  });
}
