/**
 * MCP Tool Routes - Core Self-Service Surface
 *
 * These endpoints implement the MCP tool specifications for:
 * - xidr_request_gpu: Request GPU capacity
 * - xidr_checkpoint_ack: Acknowledge checkpoint completion
 * - xidr_release: Release capacity voluntarily
 * - xidr_status: Check lease/system status
 * - xidr_explain: Get explanation for decisions
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { createLease, getLease, completeLease, updateLease, getLeaseStats } from "../../db/leases.js";
import { getAvailableCapacity, reserveCapacity, releaseCapacity, getCapacitySummary } from "../../db/capacity.js";
import { recordAuditEvent, generateLeaseExplanation } from "../../db/audit.js";
import { recordCheckpoint, getLatestCheckpoint } from "../../db/checkpoints.js";
import { registerAgent, updateCheckpointStats } from "../../db/agents.js";
import { EventType, EventSource } from "../../models/audit.js";
import { LeaseStatus } from "../../models/lease.js";
import { getCapacityLane } from "../../models/capacity.js";
import { getConfig } from "../../config.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger({ module: "mcp" });

export const mcpRoutes = new Hono();

// ============================================================================
// xidr_request_gpu - Request GPU capacity
// ============================================================================

const RequestGpuSchema = z.object({
  gpu_type: z.enum(["nvidia-t4", "nvidia-l4", "nvidia-a100-40gb", "nvidia-a100-80gb"]),
  duration_hint_seconds: z.number().min(60).max(86400).optional().default(3600),
  priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
  a2a_endpoint: z.string().url(),
  checkpointable: z.boolean().optional().default(true),
  agent_id: z.string().optional(),
  agent_name: z.string().optional(),
});

mcpRoutes.post("/tools/xidr_request_gpu", zValidator("json", RequestGpuSchema), async (c) => {
  const input = c.req.valid("json");
  const config = getConfig();

  try {
    // Register/update agent if ID provided
    const agentId = input.agent_id ?? `agent_${Date.now()}`;
    if (input.agent_id) {
      await registerAgent({
        id: input.agent_id,
        name: input.agent_name ?? input.agent_id,
        a2aEndpoint: input.a2a_endpoint,
        checkpointable: input.checkpointable,
      });
    }

    // Create lease request
    const lease = await createLease({
      tenantAgentId: agentId,
      gpuType: input.gpu_type,
      durationHintSeconds: input.duration_hint_seconds,
      priority: input.priority,
      a2aEndpoint: input.a2a_endpoint,
      checkpointable: input.checkpointable,
    });

    // Record audit event
    await recordAuditEvent({
      eventType: EventType.LEASE_REQUESTED,
      source: EventSource.API,
      leaseId: lease.id,
      agentId,
      details: {
        gpuType: input.gpu_type,
        priority: input.priority,
        durationHint: input.duration_hint_seconds,
      },
      reasoning: `Agent ${agentId} requested ${input.gpu_type} GPU with ${input.priority} priority`,
      decisionFactors: ["gpu_type", "priority", "checkpointable"],
    });

    // Try to find available capacity
    const availableUnits = await getAvailableCapacity(input.gpu_type);

    if (availableUnits.length > 0) {
      // Grant immediately
      const unit = availableUnits[0];
      await reserveCapacity(unit.id, lease.id);

      const capacityLane = getCapacityLane(unit);
      const checkpointTargetUri = `gs://${config.gcp.checkpointBucket}/${lease.id}/`;

      await updateLease(lease.id, {
        status: LeaseStatus.ACTIVE,
        capacityUnitId: unit.id,
        capacityLane,
        grantedAt: new Date(),
        connectionHost: unit.instanceName ?? `${unit.clusterName}-${unit.nodePool}`,
        connectionPort: 8080,
        gpuDevice: `/dev/nvidia${unit.gpuIndex}`,
        preemptionWarningSeconds: Math.floor(unit.preemptionGraceMs / 1000),
        checkpointTargetUri,
      });

      // Record grant event
      await recordAuditEvent({
        eventType: EventType.LEASE_GRANTED,
        source: EventSource.SCHEDULER,
        leaseId: lease.id,
        capacityUnitId: unit.id,
        agentId,
        details: {
          capacityLane,
          gpuType: unit.gpuType,
          preemptionGraceMs: unit.preemptionGraceMs,
        },
        reasoning: `Granted ${unit.gpuType} from ${capacityLane} (utilization: ${unit.utilizationPercent}%)`,
        decisionFactors: ["capacity_available", "utilization_low", capacityLane],
      });

      log.info("Lease granted immediately", { leaseId: lease.id, unitId: unit.id });

      return c.json({
        lease_id: lease.id,
        status: "granted",
        capacity_unit_id: unit.id,
        connection_info: {
          host: unit.instanceName ?? `${unit.clusterName}-${unit.nodePool}`,
          port: 8080,
          gpu_device: `/dev/nvidia${unit.gpuIndex}`,
        },
        preemption_warning_seconds: Math.floor(unit.preemptionGraceMs / 1000),
        checkpoint_target_uri: checkpointTargetUri,
      });
    }

    // No capacity available - queue the request
    log.info("Lease queued", { leaseId: lease.id, gpuType: input.gpu_type });

    return c.json({
      lease_id: lease.id,
      status: "queued",
      queue_position: 1, // TODO: Calculate actual position
      message: `No ${input.gpu_type} capacity currently available. Request queued.`,
    });
  } catch (error) {
    log.error("Failed to request GPU", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

// ============================================================================
// xidr_checkpoint_ack - Acknowledge checkpoint completion
// ============================================================================

const CheckpointAckSchema = z.object({
  lease_id: z.string(),
  checkpoint_uri: z.string().url(),
  size_bytes: z.number().min(0),
  duration_ms: z.number().min(0).optional(),
});

mcpRoutes.post("/tools/xidr_checkpoint_ack", zValidator("json", CheckpointAckSchema), async (c) => {
  const input = c.req.valid("json");

  try {
    const lease = await getLease(input.lease_id);
    if (!lease) {
      return c.json({ error: `Lease ${input.lease_id} not found` }, 404);
    }

    // Record checkpoint
    const checkpoint = await recordCheckpoint({
      leaseId: lease.id,
      agentId: lease.tenantAgentId,
      uri: input.checkpoint_uri,
      sizeBytes: input.size_bytes,
      durationMs: input.duration_ms,
    });

    // Update lease
    await updateLease(lease.id, {
      status: LeaseStatus.CHECKPOINTED,
      checkpointUri: input.checkpoint_uri,
      checkpointSizeBytes: input.size_bytes,
      checkpointDurationMs: input.duration_ms,
    });

    // Update agent stats
    if (input.duration_ms) {
      await updateCheckpointStats(lease.tenantAgentId, input.duration_ms, input.size_bytes);
    }

    // Record audit event
    await recordAuditEvent({
      eventType: EventType.CHECKPOINT_COMPLETED,
      source: EventSource.TENANT_AGENT,
      leaseId: lease.id,
      agentId: lease.tenantAgentId,
      details: {
        checkpointUri: input.checkpoint_uri,
        sizeBytes: input.size_bytes,
        durationMs: input.duration_ms,
      },
      reasoning: `Checkpoint completed in ${input.duration_ms}ms (${Math.round(input.size_bytes / 1024)}KB)`,
      decisionFactors: ["checkpoint_success"],
    });

    log.info("Checkpoint acknowledged", {
      leaseId: lease.id,
      checkpointUri: input.checkpoint_uri,
      sizeBytes: input.size_bytes,
    });

    return c.json({
      acknowledged: true,
      checkpoint_id: checkpoint.id,
      resume_queued: true,
      estimated_resume_wait_seconds: 30, // TODO: Calculate based on capacity
    });
  } catch (error) {
    log.error("Failed to acknowledge checkpoint", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

// ============================================================================
// xidr_release - Voluntarily release capacity
// ============================================================================

const ReleaseSchema = z.object({
  lease_id: z.string(),
});

mcpRoutes.post("/tools/xidr_release", zValidator("json", ReleaseSchema), async (c) => {
  const input = c.req.valid("json");
  const config = getConfig();

  try {
    const lease = await getLease(input.lease_id);
    if (!lease) {
      return c.json({ error: `Lease ${input.lease_id} not found` }, 404);
    }

    if (lease.status === LeaseStatus.COMPLETED || lease.status === LeaseStatus.LOST) {
      return c.json({ error: `Lease ${input.lease_id} already terminated` }, 400);
    }

    // Calculate billing
    const billableSeconds = lease.grantedAt
      ? Math.ceil((Date.now() - lease.grantedAt.getTime()) / 1000)
      : 0;

    const hourlyRate = config.capacity.gpuHourlyRates[lease.gpuType] ?? 0.5;
    const baselineCostUsd = (billableSeconds / 3600) * hourlyRate;
    const actualCostUsd = baselineCostUsd * (1 - config.gainSharePercent / 100);

    // Release capacity
    if (lease.capacityUnitId) {
      await releaseCapacity(lease.capacityUnitId);
    }

    // Complete lease
    await completeLease(lease.id, billableSeconds, baselineCostUsd, actualCostUsd);

    // Record audit event
    await recordAuditEvent({
      eventType: EventType.LEASE_RELEASED,
      source: EventSource.TENANT_AGENT,
      leaseId: lease.id,
      capacityUnitId: lease.capacityUnitId ?? undefined,
      agentId: lease.tenantAgentId,
      details: {
        billableSeconds,
        baselineCostUsd,
        actualCostUsd,
        savingsUsd: baselineCostUsd - actualCostUsd,
      },
      reasoning: `Agent voluntarily released after ${billableSeconds}s. Saved $${(baselineCostUsd - actualCostUsd).toFixed(4)}`,
      decisionFactors: ["voluntary_release"],
    });

    log.info("Lease released", {
      leaseId: lease.id,
      billableSeconds,
      savingsUsd: baselineCostUsd - actualCostUsd,
    });

    return c.json({
      released: true,
      billable_seconds: billableSeconds,
      baseline_cost_usd: baselineCostUsd,
      actual_cost_usd: actualCostUsd,
      savings_usd: baselineCostUsd - actualCostUsd,
    });
  } catch (error) {
    log.error("Failed to release lease", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

// ============================================================================
// xidr_status - Check lease or system status
// ============================================================================

const StatusSchema = z.object({
  lease_id: z.string().optional(),
});

mcpRoutes.post("/tools/xidr_status", zValidator("json", StatusSchema), async (c) => {
  const input = c.req.valid("json");

  try {
    if (input.lease_id) {
      // Get specific lease status
      const lease = await getLease(input.lease_id);
      if (!lease) {
        return c.json({ error: `Lease ${input.lease_id} not found` }, 404);
      }

      const checkpoint = await getLatestCheckpoint(lease.id);

      return c.json({
        lease: {
          id: lease.id,
          status: lease.status,
          gpu_type: lease.gpuType,
          capacity_unit_id: lease.capacityUnitId,
          capacity_lane: lease.capacityLane,
          granted_at: lease.grantedAt?.toISOString(),
          checkpoint_uri: lease.checkpointUri,
          preemption_warning_seconds: lease.preemptionWarningSeconds,
        },
        latest_checkpoint: checkpoint ? {
          id: checkpoint.id,
          uri: checkpoint.uri,
          size_bytes: checkpoint.sizeBytes,
          created_at: checkpoint.createdAt.toISOString(),
        } : null,
      });
    }

    // Get system status
    const [leaseStats, capacitySummary] = await Promise.all([
      getLeaseStats(),
      getCapacitySummary(),
    ]);

    return c.json({
      system: {
        active_leases: leaseStats.active,
        pending_requests: leaseStats.pending,
        completed_leases: leaseStats.completed,
        total_savings_usd: leaseStats.totalSavingsUsd,
        available_capacity: capacitySummary.byGpuType,
        capacity_summary: {
          total: capacitySummary.total,
          available: capacitySummary.available,
          leased: capacitySummary.leased,
        },
      },
    });
  } catch (error) {
    log.error("Failed to get status", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

// ============================================================================
// xidr_explain - Get explanation for scheduling/eviction decisions
// ============================================================================

const ExplainSchema = z.object({
  lease_id: z.string(),
  event_type: z.enum(["grant", "deny", "evict", "resume"]).optional(),
});

mcpRoutes.post("/tools/xidr_explain", zValidator("json", ExplainSchema), async (c) => {
  const input = c.req.valid("json");

  try {
    const lease = await getLease(input.lease_id);
    if (!lease) {
      return c.json({ error: `Lease ${input.lease_id} not found` }, 404);
    }

    // Map event_type to actual event types
    const eventTypeMap: Record<string, string> = {
      grant: EventType.LEASE_GRANTED,
      deny: EventType.LEASE_DENIED,
      evict: EventType.RECLAIM_INITIATED,
      resume: EventType.RESUME_COMPLETED,
    };

    const explanation = await generateLeaseExplanation(
      input.lease_id,
      input.event_type ? eventTypeMap[input.event_type] : undefined
    );

    return c.json({
      lease_id: input.lease_id,
      lease_status: lease.status,
      explanation: explanation.explanation,
      timeline: explanation.timeline,
      decision_factors: explanation.decisionFactors,
    });
  } catch (error) {
    log.error("Failed to generate explanation", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

// ============================================================================
// MCP Tool Discovery Endpoint
// ============================================================================

mcpRoutes.get("/tools", (c) => {
  return c.json({
    tools: [
      {
        name: "xidr_request_gpu",
        description: "Request GPU capacity from Xid-R broker",
        endpoint: "/mcp/tools/xidr_request_gpu",
        method: "POST",
      },
      {
        name: "xidr_checkpoint_ack",
        description: "Acknowledge successful checkpoint completion",
        endpoint: "/mcp/tools/xidr_checkpoint_ack",
        method: "POST",
      },
      {
        name: "xidr_release",
        description: "Voluntarily release GPU capacity",
        endpoint: "/mcp/tools/xidr_release",
        method: "POST",
      },
      {
        name: "xidr_status",
        description: "Check lease or system status",
        endpoint: "/mcp/tools/xidr_status",
        method: "POST",
      },
      {
        name: "xidr_explain",
        description: "Get explanation for scheduling decisions",
        endpoint: "/mcp/tools/xidr_explain",
        method: "POST",
      },
    ],
  });
});
