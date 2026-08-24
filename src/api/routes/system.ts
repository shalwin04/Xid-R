/**
 * System management routes.
 */

import { Hono } from "hono";
import { z } from "zod";

import { getLeaseStats } from "../../db/leases.js";
import { getCapacitySummary } from "../../db/capacity.js";
import { getCheckpointStats } from "../../db/checkpoints.js";
import { getRecentAuditEvents } from "../../db/audit.js";
import { getConfig } from "../../config.js";
import { getPreemptionListener } from "../../capacity/preemption-listener.js";

export const systemRoutes = new Hono();

// Get system overview
systemRoutes.get("/overview", async (c) => {
  const [leaseStats, capacitySummary, checkpointStats] = await Promise.all([
    getLeaseStats(),
    getCapacitySummary(),
    getCheckpointStats(),
  ]);

  return c.json({
    leases: leaseStats,
    capacity: capacitySummary,
    checkpoints: checkpointStats,
    timestamp: new Date().toISOString(),
  });
});

// Get recent events (for dashboard)
systemRoutes.get("/events", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const events = await getRecentAuditEvents(limit);

  return c.json({
    events: events.map((e) => ({
      id: e.id,
      timestamp: e.timestamp.toISOString(),
      type: e.eventType,
      lease_id: e.leaseId,
      capacity_unit_id: e.capacityUnitId,
      agent_id: e.agentId,
      reasoning: e.reasoning,
    })),
  });
});

// Get configuration (non-sensitive)
systemRoutes.get("/config", (c) => {
  const config = getConfig();

  return c.json({
    environment: config.environment,
    gcp: {
      project_id: config.gcp.projectId,
      region: config.gcp.region,
      zone: config.gcp.zone,
    },
    capacity: {
      idle_threshold_percent: config.capacity.idleThresholdPercent,
      harvestable_idle_duration_ms: config.capacity.harvestableIdleDurationMs,
      spot_preemption_grace_ms: config.capacity.spotPreemptionGraceMs,
    },
    pricing: {
      gain_share_percent: config.gainSharePercent,
      gpu_hourly_rates: config.capacity.gpuHourlyRates,
    },
  });
});

// Get dashboard data (aggregated for real-time display)
systemRoutes.get("/dashboard", async (c) => {
  const [leaseStats, capacitySummary, checkpointStats, recentEvents] = await Promise.all([
    getLeaseStats(),
    getCapacitySummary(),
    getCheckpointStats(),
    getRecentAuditEvents(10),
  ]);

  return c.json({
    stats: {
      active_leases: leaseStats.active,
      pending_requests: leaseStats.pending,
      total_savings_usd: leaseStats.totalSavingsUsd,
      checkpoints_completed: checkpointStats.complete,
    },
    capacity: {
      total: capacitySummary.total,
      available: capacitySummary.available,
      leased: capacitySummary.leased,
      by_gpu_type: capacitySummary.byGpuType,
    },
    recent_events: recentEvents.slice(0, 5).map((e) => ({
      type: e.eventType,
      timestamp: e.timestamp.toISOString(),
      summary: e.reasoning ?? e.eventType.replace(/_/g, " "),
    })),
    updated_at: new Date().toISOString(),
  });
});

// === Preemption Management ===

const TriggerReclaimSchema = z.object({
  capacity_unit_id: z.string(),
  reason: z.enum(["spot_preemption", "utilization_spike", "maintenance", "manual"]).default("manual"),
  grace_ms: z.number().optional(),
});

// Trigger manual reclaim on a capacity unit
systemRoutes.post("/preemption/trigger", async (c) => {
  const body = await c.req.json();
  const parsed = TriggerReclaimSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.errors }, 400);
  }

  const { capacity_unit_id, reason, grace_ms } = parsed.data;

  const listener = getPreemptionListener();
  const result = await listener.triggerManualReclaim(capacity_unit_id, reason, grace_ms);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({
    success: true,
    message: `Reclaim initiated for ${capacity_unit_id}`,
    reason,
  });
});

// Simulate utilization spike
systemRoutes.post("/preemption/utilization-spike", async (c) => {
  const body = await c.req.json();
  const { capacity_unit_id, utilization_percent } = body;

  if (!capacity_unit_id || typeof utilization_percent !== "number") {
    return c.json({ error: "capacity_unit_id and utilization_percent required" }, 400);
  }

  const listener = getPreemptionListener();
  const result = await listener.triggerUtilizationSpike(capacity_unit_id, utilization_percent);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({
    success: true,
    message: `Utilization spike triggered for ${capacity_unit_id}`,
    utilization_percent,
  });
});

// Get preemption listener status
systemRoutes.get("/preemption/status", (c) => {
  const listener = getPreemptionListener();
  return c.json(listener.getStatus());
});

// Start/stop preemption listener
systemRoutes.post("/preemption/start", (c) => {
  const listener = getPreemptionListener();
  listener.start();
  return c.json({ success: true, message: "Preemption listener started" });
});

systemRoutes.post("/preemption/stop", (c) => {
  const listener = getPreemptionListener();
  listener.stop();
  return c.json({ success: true, message: "Preemption listener stopped" });
});
