/**
 * Agentic Negotiator - LLM-Powered Reclaim Negotiation
 *
 * Uses Gemini to intelligently negotiate with tenant agents during
 * capacity reclaim. This is the "demo star" showing real A2A coordination.
 */

import { EventEmitter } from "eventemitter3";
import { Tool, SchemaType } from "@google/generative-ai";

import { GeminiClient, getGeminiClient, FunctionCall } from "./gemini-client.js";
import { getConfig } from "../../config.js";
import { createLogger } from "../../utils/logger.js";
import {
  getLease,
  updateLease,
  markLeaseLost,
  getActiveLeaseForCapacity,
} from "../../db/leases.js";
import { releaseCapacity, markDraining, getCapacityUnit } from "../../db/capacity.js";
import { recordAuditEvent } from "../../db/audit.js";
import { getAgentCard } from "../../db/agents.js";
import { EventType, EventSource } from "../../models/audit.js";
import { LeaseStatus } from "../../models/lease.js";
import { initFirestore } from "../../db/firestore.js";

const log = createLogger({ module: "agentic-negotiator" });

const NEGOTIATOR_SYSTEM_PROMPT = `You are the Xid-R Negotiator Agent, an intelligent capacity reclaim coordinator.

Your role is to negotiate with tenant AI agents when GPU capacity needs to be reclaimed due to:
- Spot VM preemption notices
- Primary workload utilization spikes
- Scheduled maintenance
- Manual reclaim requests

When negotiating, you must:
1. Be fair and give agents time to checkpoint their state
2. Consider the urgency of the reclaim reason
3. Offer multiple options (checkpoint, migrate, accept loss)
4. Monitor the negotiation timeout
5. Force eviction only when necessary

You have access to functions to:
- get_lease_info: Get details about a lease being reclaimed
- get_agent_info: Get info about the tenant agent
- send_reclaim_request: Send A2A reclaim request to tenant agent
- wait_for_checkpoint: Wait for tenant to complete checkpoint
- force_evict: Force eviction when negotiation fails
- release_capacity: Release the capacity unit after successful handoff
- record_decision: Record your reasoning for audit

Always explain your negotiation strategy and decisions.
Be empathetic to agents but firm about capacity constraints.`;

export interface AgenticNegotiatorEvents {
  reclaimInitiated: (leaseId: string, reason: string, reasoning: string) => void;
  negotiationStarted: (leaseId: string, strategy: string) => void;
  negotiationCompleted: (leaseId: string, outcome: string, reasoning: string) => void;
  checkpointCompleted: (leaseId: string, uri: string) => void;
  leaseLost: (leaseId: string, reason: string) => void;
  agentThinking: (thought: string) => void;
}

export type ReclaimReason = "spot_preemption" | "utilization_spike" | "maintenance" | "manual";

export class AgenticNegotiator extends EventEmitter<AgenticNegotiatorEvents> {
  private config = getConfig();
  private gemini: GeminiClient;
  private activeNegotiations = new Map<string, AbortController>();
  private tools: Tool[];

  constructor() {
    super();
    this.gemini = getGeminiClient();
    this.tools = this.createTools();
  }

  /**
   * Create function calling tools for the negotiator.
   */
  private createTools(): Tool[] {
    return [
      {
        functionDeclarations: [
          {
            name: "get_lease_info",
            description: "Get detailed information about a lease being reclaimed",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                lease_id: {
                  type: SchemaType.STRING,
                  description: "The ID of the lease",
                },
              },
              required: ["lease_id"],
            },
          },
          {
            name: "get_agent_info",
            description: "Get information about the tenant agent",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                agent_id: {
                  type: SchemaType.STRING,
                  description: "The ID of the agent",
                },
              },
              required: ["agent_id"],
            },
          },
          {
            name: "send_reclaim_request",
            description: "Send A2A reclaim request to the tenant agent",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                lease_id: {
                  type: SchemaType.STRING,
                  description: "The lease ID",
                },
                grace_period_seconds: {
                  type: SchemaType.NUMBER,
                  description: "Grace period for checkpoint/migration",
                },
                message: {
                  type: SchemaType.STRING,
                  description: "Human-readable message for the agent",
                },
              },
              required: ["lease_id", "grace_period_seconds"],
            },
          },
          {
            name: "wait_for_checkpoint",
            description: "Wait for the tenant agent to complete checkpoint",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                lease_id: {
                  type: SchemaType.STRING,
                  description: "The lease ID",
                },
                timeout_seconds: {
                  type: SchemaType.NUMBER,
                  description: "Maximum time to wait",
                },
              },
              required: ["lease_id", "timeout_seconds"],
            },
          },
          {
            name: "force_evict",
            description: "Force eviction when negotiation fails or times out",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                lease_id: {
                  type: SchemaType.STRING,
                  description: "The lease ID",
                },
                reason: {
                  type: SchemaType.STRING,
                  description: "Why eviction is being forced",
                },
              },
              required: ["lease_id", "reason"],
            },
          },
          {
            name: "release_capacity",
            description: "Release the capacity unit after successful handoff",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                lease_id: {
                  type: SchemaType.STRING,
                  description: "The lease ID",
                },
              },
              required: ["lease_id"],
            },
          },
          {
            name: "record_decision",
            description: "Record your negotiation decision and reasoning for audit",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                lease_id: {
                  type: SchemaType.STRING,
                  description: "The lease ID",
                },
                decision: {
                  type: SchemaType.STRING,
                  description: "What decision was made",
                },
                reasoning: {
                  type: SchemaType.STRING,
                  description: "Detailed explanation of your reasoning",
                },
                factors: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                  description: "Key factors that influenced the decision",
                },
              },
              required: ["lease_id", "decision", "reasoning", "factors"],
            },
          },
        ],
      },
    ];
  }

  /**
   * Execute a function call from the LLM.
   */
  private async executeFunction(call: FunctionCall, context: ReclaimContext): Promise<unknown> {
    log.debug("Executing function", { name: call.name, args: call.args });

    switch (call.name) {
      case "get_lease_info":
        return await this.handleGetLeaseInfo(call.args.lease_id as string);

      case "get_agent_info":
        return await this.handleGetAgentInfo(call.args.agent_id as string);

      case "send_reclaim_request":
        return await this.handleSendReclaimRequest(
          call.args.lease_id as string,
          call.args.grace_period_seconds as number,
          context.reason,
          call.args.message as string | undefined
        );

      case "wait_for_checkpoint":
        return await this.handleWaitForCheckpoint(
          call.args.lease_id as string,
          call.args.timeout_seconds as number
        );

      case "force_evict":
        return await this.handleForceEvict(
          call.args.lease_id as string,
          call.args.reason as string
        );

      case "release_capacity":
        return await this.handleReleaseCapacity(call.args.lease_id as string);

      case "record_decision":
        return await this.handleRecordDecision(
          call.args.lease_id as string,
          call.args.decision as string,
          call.args.reasoning as string,
          call.args.factors as string[]
        );

      default:
        return { error: `Unknown function: ${call.name}` };
    }
  }

  private async handleGetLeaseInfo(leaseId: string): Promise<unknown> {
    const lease = await getLease(leaseId);
    if (!lease) {
      return { error: "Lease not found" };
    }
    return {
      id: lease.id,
      status: lease.status,
      agent_id: lease.tenantAgentId,
      gpu_type: lease.gpuType,
      priority: lease.priority,
      checkpointable: lease.checkpointable,
      a2a_endpoint: lease.a2aEndpoint,
      capacity_unit_id: lease.capacityUnitId,
      granted_at: lease.grantedAt?.toISOString(),
      checkpoint_target_uri: lease.checkpointTargetUri,
    };
  }

  private async handleGetAgentInfo(agentId: string): Promise<unknown> {
    const card = await getAgentCard(agentId);
    if (!card) {
      return { error: "Agent not found", agent_id: agentId };
    }
    return {
      id: card.id,
      name: card.name,
      description: card.description,
      checkpointable: card.checkpointable,
      trust_tier: card.trustTier,
      estimated_checkpoint_size_bytes: card.estimatedCheckpointSizeBytes,
      supported_tasks: card.supportedTasks,
    };
  }

  private async handleSendReclaimRequest(
    leaseId: string,
    gracePeriodSeconds: number,
    reason: ReclaimReason,
    message?: string
  ): Promise<unknown> {
    const lease = await getLease(leaseId);
    if (!lease?.a2aEndpoint) {
      return { success: false, error: "No A2A endpoint available" };
    }

    try {
      // Send A2A request
      const request = {
        type: "reclaim_request",
        lease_id: leaseId,
        grace_period_seconds: gracePeriodSeconds,
        reason,
        message: message || `Capacity reclaim requested due to ${reason}`,
        options: [
          { action: "checkpoint", target: lease.checkpointTargetUri },
          { action: "migrate", target: "cloud_run_worker_pool" },
          { action: "accept_loss" },
        ],
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), gracePeriodSeconds * 1000);

      const response = await fetch(`${lease.a2aEndpoint}/a2a/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-A2A-Protocol": "xidr-negotiation/1.0",
        },
        body: JSON.stringify({ task_type: "reclaim_request", data: request }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: `A2A request failed: ${response.status}`,
          should_force_evict: true,
        };
      }

      const result = (await response.json()) as {
        data: { chosen_action: string; estimated_duration_seconds?: number };
      };

      // Update lease status
      await updateLease(leaseId, { status: LeaseStatus.NEGOTIATING });

      return {
        success: true,
        chosen_action: result.data.chosen_action,
        estimated_duration_seconds: result.data.estimated_duration_seconds,
      };
    } catch (error) {
      const isTimeout = (error as Error).name === "AbortError";
      return {
        success: false,
        error: isTimeout ? "Request timed out" : (error as Error).message,
        should_force_evict: true,
      };
    }
  }

  private async handleWaitForCheckpoint(
    leaseId: string,
    timeoutSeconds: number
  ): Promise<unknown> {
    await updateLease(leaseId, { status: LeaseStatus.CHECKPOINTING });

    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;
    const pollInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      const lease = await getLease(leaseId);

      if (lease?.status === LeaseStatus.CHECKPOINTED) {
        return {
          success: true,
          checkpoint_uri: lease.checkpointUri,
          checkpoint_size_bytes: lease.checkpointSizeBytes,
          duration_ms: Date.now() - startTime,
        };
      }

      if (lease?.status === LeaseStatus.LOST) {
        return { success: false, error: "Lease was lost" };
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return {
      success: false,
      error: "Checkpoint timeout",
      elapsed_ms: Date.now() - startTime,
    };
  }

  private async handleForceEvict(leaseId: string, reason: string): Promise<unknown> {
    await markLeaseLost(leaseId, "preempted");

    const lease = await getLease(leaseId);
    if (lease?.capacityUnitId) {
      await releaseCapacity(lease.capacityUnitId);
    }

    this.emit("leaseLost", leaseId, reason);

    return { success: true, reason };
  }

  private async handleReleaseCapacity(leaseId: string): Promise<unknown> {
    const lease = await getLease(leaseId);
    if (!lease?.capacityUnitId) {
      return { success: false, error: "No capacity unit assigned" };
    }

    await releaseCapacity(lease.capacityUnitId);

    if (lease.checkpointUri) {
      this.emit("checkpointCompleted", leaseId, lease.checkpointUri);
    }

    return { success: true, capacity_unit_id: lease.capacityUnitId };
  }

  private async handleRecordDecision(
    leaseId: string,
    decision: string,
    reasoning: string,
    factors: string[]
  ): Promise<unknown> {
    await recordAuditEvent({
      eventType: EventType.NEGOTIATION_COMPLETED,
      source: EventSource.NEGOTIATOR,
      leaseId,
      details: {
        decision,
        agentPowered: true,
      },
      reasoning,
      decisionFactors: ["llm_decision", ...factors],
    });

    this.emit("negotiationCompleted", leaseId, decision, reasoning);

    return { recorded: true };
  }

  /**
   * Initiate an LLM-powered reclaim negotiation.
   */
  async initiateReclaim(
    capacityUnitId: string,
    reason: ReclaimReason,
    graceMs?: number
  ): Promise<boolean> {
    try {
      // Get the active lease for this capacity
      const lease = await getActiveLeaseForCapacity(capacityUnitId);

      if (!lease) {
        log.info("No active lease for capacity unit", { capacityUnitId });
        await releaseCapacity(capacityUnitId);
        return true;
      }

      const unit = await getCapacityUnit(capacityUnitId);
      const gracePeriodMs = graceMs ?? unit?.preemptionGraceMs ?? 120000;

      log.info("Initiating agentic reclaim", {
        leaseId: lease.id,
        capacityUnitId,
        reason,
        gracePeriodMs,
      });

      // Mark capacity as draining
      await markDraining(capacityUnitId);

      // Record reclaim initiation
      await recordAuditEvent({
        eventType: EventType.RECLAIM_INITIATED,
        source: EventSource.NEGOTIATOR,
        leaseId: lease.id,
        capacityUnitId,
        details: { reason, gracePeriodMs, agentPowered: true },
        reasoning: `Agentic reclaim initiated due to ${reason}`,
        decisionFactors: [reason, `grace_period:${gracePeriodMs}ms`, "llm_negotiation"],
      });

      this.emit("reclaimInitiated", lease.id, reason, "Starting LLM-powered negotiation");

      // Run the agentic negotiation
      return await this.negotiate(lease.id, reason, gracePeriodMs);
    } catch (error) {
      log.error("Failed to initiate agentic reclaim", {
        capacityUnitId,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Run the LLM-powered negotiation loop.
   */
  private async negotiate(
    leaseId: string,
    reason: ReclaimReason,
    gracePeriodMs: number
  ): Promise<boolean> {
    const controller = new AbortController();
    this.activeNegotiations.set(leaseId, controller);

    const context: ReclaimContext = { leaseId, reason, gracePeriodMs };

    try {
      const prompt = `You need to negotiate a capacity reclaim for lease ${leaseId}.

Reason for reclaim: ${reason}
Grace period: ${gracePeriodMs}ms (${Math.floor(gracePeriodMs / 1000)} seconds)

Please:
1. First call get_lease_info to understand the current lease state
2. Optionally call get_agent_info to learn about the tenant agent
3. Send a reclaim request with send_reclaim_request
4. Based on the agent's response:
   - If they chose "checkpoint": call wait_for_checkpoint, then release_capacity
   - If they chose "migrate": release_capacity (migration handled separately)
   - If they chose "accept_loss" or no response: call force_evict
5. Call record_decision with your reasoning

Be empathetic but firm. The capacity MUST be reclaimed within the grace period.
For spot_preemption, urgency is highest. For maintenance, you can be more lenient.`;

      this.emit("negotiationStarted", leaseId, "LLM-powered negotiation");
      this.emit("agentThinking", `Analyzing reclaim situation for lease ${leaseId}...`);

      // Run the agentic loop
      let response = await this.gemini.generate(prompt, NEGOTIATOR_SYSTEM_PROMPT, this.tools);
      let iterations = 0;
      const maxIterations = 15;

      while (response.functionCalls && iterations < maxIterations) {
        iterations++;

        for (const call of response.functionCalls) {
          const result = await this.executeFunction(call, context);

          const functionResultPrompt = `Function ${call.name} returned: ${JSON.stringify(result, null, 2)}

Continue with your negotiation strategy.`;

          this.emit("agentThinking", `Executed ${call.name}, deciding next action...`);
          response = await this.gemini.generate(functionResultPrompt, NEGOTIATOR_SYSTEM_PROMPT, this.tools);
        }
      }

      log.info("Agentic negotiation complete", { leaseId, iterations });
      return true;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        log.info("Negotiation cancelled", { leaseId });
        return false;
      }
      log.error("Agentic negotiation failed", { leaseId, error: (error as Error).message });

      // Force evict on error
      await this.handleForceEvict(leaseId, "negotiation_error");
      return false;
    } finally {
      this.activeNegotiations.delete(leaseId);
    }
  }

  /**
   * Cancel an active negotiation.
   */
  cancelNegotiation(leaseId: string): void {
    const controller = this.activeNegotiations.get(leaseId);
    if (controller) {
      controller.abort();
      this.activeNegotiations.delete(leaseId);
      log.info("Negotiation cancelled", { leaseId });
    }
  }
}

interface ReclaimContext {
  leaseId: string;
  reason: ReclaimReason;
  gracePeriodMs: number;
}

// Singleton
let negotiator: AgenticNegotiator | null = null;

export function getAgenticNegotiator(): AgenticNegotiator {
  if (!negotiator) {
    negotiator = new AgenticNegotiator();
  }
  return negotiator;
}

// Main entry point
export async function run(): Promise<void> {
  log.info("Starting Agentic Negotiator (Gemini-powered)");

  initFirestore();

  const agent = getAgenticNegotiator();

  agent.on("agentThinking", (thought) => {
    log.debug("Agent thinking", { thought });
  });

  agent.on("negotiationCompleted", (leaseId, outcome, reasoning) => {
    log.info("Negotiation completed by LLM", { leaseId, outcome, reasoning });
  });

  process.on("SIGINT", () => {
    log.info("Received SIGINT, shutting down");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    log.info("Received SIGTERM, shutting down");
    process.exit(0);
  });

  log.info("Agentic Negotiator ready for reclaim requests");

  // Keep process alive
  await new Promise(() => {});
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    log.error("Agentic Negotiator failed", { error: err.message });
    process.exit(1);
  });
}
