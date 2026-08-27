/**
 * Agentic Scheduler - LLM-Powered GPU Allocation
 *
 * Uses Gemini to reason about capacity allocation decisions.
 * This is the "brain" that makes intelligent matching decisions.
 */

import { EventEmitter } from "eventemitter3";
import { Tool, SchemaType } from "@google/generative-ai";

import { GeminiClient, getGeminiClient, FunctionCall } from "./gemini-client.js";
import { getConfig } from "../../config.js";
import { createLogger } from "../../utils/logger.js";
import {
  getPendingLeases,
  grantLease,
  getLease,
} from "../../db/leases.js";
import {
  getAvailableCapacity,
  reserveCapacity,
  getCapacitySummary,
  getAllCapacityUnits,
} from "../../db/capacity.js";
import { recordAuditEvent } from "../../db/audit.js";
import { EventType, EventSource } from "../../models/audit.js";
import { CapacityUnit, getCapacityLane } from "../../models/capacity.js";
import type { Lease } from "../../models/lease.js";
import { initFirestore } from "../../db/firestore.js";

const log = createLogger({ module: "agentic-scheduler" });

const SCHEDULER_SYSTEM_PROMPT = `You are the Xid-R Scheduler Agent, an intelligent GPU capacity allocation system.

Your role is to match pending GPU requests from AI agents to available capacity units.

When making decisions, consider:
1. GPU type match (required)
2. Utilization levels (prefer lower utilization for better isolation)
3. Priority of the request (high priority gets better resources)
4. Preemption grace period (high priority should get longer grace periods)
5. Trust tier compatibility
6. Cost efficiency (Spot VMs are cheaper but can be preempted)

You have access to functions to:
- list_pending_requests: Get all pending GPU lease requests
- list_available_capacity: Get available GPU capacity units
- get_capacity_summary: Get overall capacity statistics
- grant_lease: Assign a capacity unit to a pending lease
- explain_decision: Record your reasoning for audit trails

Always explain your reasoning before making allocation decisions.
Be fair but prioritize based on declared priority levels.`;

export interface AgenticSchedulerEvents {
  leaseGranted: (leaseId: string, capacityUnitId: string, reasoning: string) => void;
  leaseDenied: (leaseId: string, reason: string) => void;
  cycleComplete: (processed: number, granted: number, reasoning: string) => void;
  agentThinking: (thought: string) => void;
}

export class AgenticScheduler extends EventEmitter<AgenticSchedulerEvents> {
  private config = getConfig();
  private gemini: GeminiClient;
  private running = false;
  private intervalHandle: NodeJS.Timeout | null = null;
  private tools: Tool[];

  constructor() {
    super();
    this.gemini = getGeminiClient();
    this.tools = this.createTools();
  }

  /**
   * Create function calling tools for the scheduler.
   */
  private createTools(): Tool[] {
    return [
      {
        functionDeclarations: [
          {
            name: "list_pending_requests",
            description: "Get all pending GPU lease requests waiting to be fulfilled",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {},
            },
          },
          {
            name: "list_available_capacity",
            description: "Get available GPU capacity units that can be allocated",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                gpu_type: {
                  type: SchemaType.STRING,
                  description: "Filter by GPU type (optional)",
                },
              },
            },
          },
          {
            name: "get_capacity_summary",
            description: "Get overall capacity statistics and utilization",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {},
            },
          },
          {
            name: "grant_lease",
            description: "Assign a specific capacity unit to a pending lease request",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                lease_id: {
                  type: SchemaType.STRING,
                  description: "The ID of the lease to grant",
                },
                capacity_unit_id: {
                  type: SchemaType.STRING,
                  description: "The ID of the capacity unit to assign",
                },
                reasoning: {
                  type: SchemaType.STRING,
                  description: "Explanation of why this allocation was chosen",
                },
              },
              required: ["lease_id", "capacity_unit_id", "reasoning"],
            },
          },
        ],
      },
    ];
  }

  /**
   * Execute a function call from the LLM.
   */
  private async executeFunction(call: FunctionCall): Promise<unknown> {
    log.debug("Executing function", { name: call.name, args: call.args });

    switch (call.name) {
      case "list_pending_requests":
        return await this.handleListPendingRequests();

      case "list_available_capacity":
        return await this.handleListAvailableCapacity(call.args.gpu_type as string | undefined);

      case "get_capacity_summary":
        return await this.handleGetCapacitySummary();

      case "grant_lease":
        return await this.handleGrantLease(
          call.args.lease_id as string,
          call.args.capacity_unit_id as string,
          call.args.reasoning as string
        );

      default:
        return { error: `Unknown function: ${call.name}` };
    }
  }

  private async handleListPendingRequests(): Promise<unknown> {
    const leases = await getPendingLeases();
    return {
      pending_count: leases.length,
      requests: leases.map((l) => ({
        id: l.id,
        agent_id: l.tenantAgentId,
        gpu_type: l.gpuType,
        priority: l.priority,
        duration_hint_seconds: l.durationHintSeconds,
        checkpointable: l.checkpointable,
        requested_at: l.requestedAt.toISOString(),
      })),
    };
  }

  private async handleListAvailableCapacity(gpuType?: string): Promise<unknown> {
    // If no gpuType specified, get summary of all available capacity
    if (!gpuType) {
      const summary = await getCapacitySummary();
      const allGpuTypes = Object.keys(summary.byGpuType);
      const allUnits: unknown[] = [];

      for (const type of allGpuTypes) {
        const units = await getAvailableCapacity(type);
        for (const u of units) {
          allUnits.push({
            id: u.id,
            gpu_type: u.gpuType,
            gpu_index: u.gpuIndex,
            utilization_percent: u.utilizationPercent,
            status: u.status,
            isolation_mode: u.isolationMode,
            trust_tier: u.trustTier,
            preemption_grace_ms: u.preemptionGraceMs,
            on_demand_hourly_usd: u.onDemandHourlyUsd,
            zone: u.zone,
            instance_name: u.instanceName,
          });
        }
      }

      return {
        available_count: allUnits.length,
        capacity_units: allUnits,
      };
    }

    const units = await getAvailableCapacity(gpuType);
    return {
      available_count: units.length,
      capacity_units: units.map((u) => ({
        id: u.id,
        gpu_type: u.gpuType,
        gpu_index: u.gpuIndex,
        utilization_percent: u.utilizationPercent,
        status: u.status,
        isolation_mode: u.isolationMode,
        trust_tier: u.trustTier,
        preemption_grace_ms: u.preemptionGraceMs,
        on_demand_hourly_usd: u.onDemandHourlyUsd,
        zone: u.zone,
        instance_name: u.instanceName,
      })),
    };
  }

  private async handleGetCapacitySummary(): Promise<unknown> {
    const summary = await getCapacitySummary();
    return summary;
  }

  private async handleGrantLease(
    leaseId: string,
    capacityUnitId: string,
    reasoning: string
  ): Promise<unknown> {
    try {
      // Verify lease exists and is pending
      const lease = await getLease(leaseId);
      if (!lease) {
        return { success: false, error: "Lease not found" };
      }
      if (lease.status !== "pending") {
        return { success: false, error: `Lease is not pending (status: ${lease.status})` };
      }

      // Get capacity unit
      const allUnits = await getAllCapacityUnits();
      const unit = allUnits.find((u) => u.id === capacityUnitId && u.status === "available");
      if (!unit) {
        return { success: false, error: "Capacity unit not available" };
      }

      // Reserve and grant
      await reserveCapacity(unit.id, leaseId);
      const capacityLane = getCapacityLane(unit);

      await grantLease(
        leaseId,
        unit.id,
        capacityLane,
        {
          host: unit.instanceName ?? `${unit.clusterName}-${unit.nodePool}`,
          port: 8080,
          gpuDevice: `/dev/nvidia${unit.gpuIndex}`,
        },
        Math.floor(unit.preemptionGraceMs / 1000),
        this.config.gcp.checkpointBucket
      );

      // Record audit event with LLM reasoning
      await recordAuditEvent({
        eventType: EventType.LEASE_GRANTED,
        source: EventSource.SCHEDULER,
        leaseId,
        capacityUnitId: unit.id,
        details: {
          capacityLane,
          gpuType: unit.gpuType,
          utilizationPercent: unit.utilizationPercent,
          preemptionGraceMs: unit.preemptionGraceMs,
          agentPowered: true,
        },
        reasoning,
        decisionFactors: [
          "llm_decision",
          `gpu_type:${unit.gpuType}`,
          `utilization:${unit.utilizationPercent}%`,
          `lane:${capacityLane}`,
        ],
      });

      this.emit("leaseGranted", leaseId, unit.id, reasoning);

      return {
        success: true,
        lease_id: leaseId,
        capacity_unit_id: unit.id,
        capacity_lane: capacityLane,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      log.error("Grant lease failed", { leaseId, capacityUnitId, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Start the agentic scheduler loop.
   */
  start(intervalMs: number = 10000): void {
    if (this.running) {
      log.warn("Agentic Scheduler already running");
      return;
    }

    this.running = true;
    log.info("Agentic Scheduler started", { intervalMs });

    // Run immediately, then on interval
    this.runCycle();
    this.intervalHandle = setInterval(() => this.runCycle(), intervalMs);
  }

  /**
   * Stop the scheduler loop.
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    log.info("Agentic Scheduler stopped");
  }

  /**
   * Run a single agentic scheduling cycle.
   */
  async runCycle(): Promise<{ processed: number; granted: number }> {
    const startTime = Date.now();
    let processed = 0;
    let granted = 0;

    try {
      // Check if there are pending requests
      const pending = await getPendingLeases();
      if (pending.length === 0) {
        return { processed: 0, granted: 0 };
      }

      processed = pending.length;

      // Ask the LLM to analyze and make allocation decisions
      const prompt = `You are running a scheduling cycle. There are ${pending.length} pending GPU requests.

Please:
1. First call list_pending_requests to see what's waiting
2. Then call list_available_capacity to see what resources are available
3. Analyze the situation and make allocation decisions
4. For each good match, call grant_lease with your reasoning

Be efficient and fair. Consider priorities, GPU types, and cost.
If there's no suitable capacity for a request, that's okay - explain why.`;

      this.emit("agentThinking", "Analyzing pending requests and available capacity...");

      // Run the agentic loop with function calling
      let response = await this.gemini.generate(prompt, SCHEDULER_SYSTEM_PROMPT, this.tools);
      let iterations = 0;
      const maxIterations = 10;

      while (response.functionCalls && iterations < maxIterations) {
        iterations++;

        // Execute all function calls
        for (const call of response.functionCalls) {
          const result = await this.executeFunction(call);

          if (call.name === "grant_lease") {
            const grantResult = result as { success: boolean };
            if (grantResult.success) {
              granted++;
            }
          }

          // Continue the conversation with function results
          const functionResultPrompt = `Function ${call.name} returned: ${JSON.stringify(result, null, 2)}

Continue with your analysis and decision-making.`;

          this.emit("agentThinking", `Processed ${call.name}, continuing analysis...`);
          response = await this.gemini.generate(functionResultPrompt, SCHEDULER_SYSTEM_PROMPT, this.tools);
        }
      }

      const duration = Date.now() - startTime;
      const reasoning = response.reasoning || "Completed scheduling cycle";

      log.info("Agentic scheduling cycle complete", {
        processed,
        granted,
        durationMs: duration,
        iterations,
      });

      this.emit("cycleComplete", processed, granted, reasoning);

      return { processed, granted };
    } catch (error) {
      log.error("Agentic scheduling cycle failed", { error: (error as Error).message });
      return { processed, granted };
    }
  }
}

// Singleton
let scheduler: AgenticScheduler | null = null;

export function getAgenticScheduler(): AgenticScheduler {
  if (!scheduler) {
    scheduler = new AgenticScheduler();
  }
  return scheduler;
}

// Main entry point
export async function run(): Promise<void> {
  log.info("Starting Agentic Scheduler (Gemini-powered)");

  initFirestore();

  const agent = getAgenticScheduler();

  agent.on("agentThinking", (thought) => {
    log.debug("Agent thinking", { thought });
  });

  agent.on("leaseGranted", (leaseId, capacityUnitId, reasoning) => {
    log.info("Lease granted by LLM", { leaseId, capacityUnitId, reasoning });
  });

  process.on("SIGINT", () => {
    log.info("Received SIGINT, shutting down");
    agent.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    log.info("Received SIGTERM, shutting down");
    agent.stop();
    process.exit(0);
  });

  agent.start(10000);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    log.error("Agentic Scheduler failed", { error: err.message });
    process.exit(1);
  });
}
