/**
 * Negotiator Agent
 *
 * Handles capacity reclaim via A2A negotiation with tenant agents.
 * This is the "demo star" - shows real agent-to-agent coordination.
 */

import { EventEmitter } from "eventemitter3";

import { getConfig } from "../config.js";
import { createLogger } from "../utils/logger.js";
import {
  getLease,
  updateLease,
  markLeaseLost,
  getActiveLeaseForCapacity,
} from "../db/leases.js";
import { releaseCapacity, markDraining, getCapacityUnit } from "../db/capacity.js";
import { recordAuditEvent } from "../db/audit.js";
import { getAgentCard } from "../db/agents.js";
import { EventType, EventSource } from "../models/audit.js";
import { LeaseStatus } from "../models/lease.js";
import { initFirestore } from "../db/firestore.js";

const log = createLogger({ module: "negotiator" });

/**
 * A2A Task types for negotiation.
 */
export interface ReclaimRequest {
  type: "reclaim_request";
  lease_id: string;
  grace_period_seconds: number;
  reason: "spot_preemption" | "utilization_spike" | "maintenance" | "manual";
  options: Array<{
    action: "checkpoint" | "migrate" | "accept_loss";
    target?: string;
  }>;
}

export interface ReclaimResponse {
  type: "reclaim_response";
  lease_id: string;
  chosen_action: "checkpoint" | "migrate" | "accept_loss";
  estimated_duration_seconds?: number;
}

export interface CheckpointComplete {
  type: "checkpoint_complete";
  lease_id: string;
  checkpoint_uri: string;
  state_size_bytes: number;
}

export interface NegotiatorEvents {
  reclaimInitiated: (leaseId: string, reason: string) => void;
  negotiationStarted: (leaseId: string, agentEndpoint: string) => void;
  negotiationCompleted: (leaseId: string, action: string) => void;
  checkpointCompleted: (leaseId: string, uri: string) => void;
  leaseLost: (leaseId: string, reason: string) => void;
}

export class NegotiatorAgent extends EventEmitter<NegotiatorEvents> {
  private config = getConfig();
  private activeNegotiations = new Map<string, AbortController>();

  /**
   * Initiate reclaim for a capacity unit.
   *
   * Called when:
   * - Spot preemption notice received
   * - Primary workload utilization spikes
   * - Manual reclaim requested
   */
  async initiateReclaim(
    capacityUnitId: string,
    reason: ReclaimRequest["reason"],
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

      log.info("Initiating reclaim", {
        leaseId: lease.id,
        capacityUnitId,
        reason,
        gracePeriodMs,
      });

      // Mark capacity as draining
      await markDraining(capacityUnitId);

      // Update lease status
      await updateLease(lease.id, { status: LeaseStatus.NEGOTIATING });

      // Record audit event
      await recordAuditEvent({
        eventType: EventType.RECLAIM_INITIATED,
        source: EventSource.NEGOTIATOR,
        leaseId: lease.id,
        capacityUnitId,
        details: { reason, gracePeriodMs },
        reasoning: `Reclaim initiated due to ${reason} with ${gracePeriodMs}ms grace period`,
        decisionFactors: [reason, `grace_period:${gracePeriodMs}ms`],
      });

      this.emit("reclaimInitiated", lease.id, reason);

      // Start negotiation
      return await this.negotiate(lease.id, reason, gracePeriodMs);
    } catch (error) {
      log.error("Failed to initiate reclaim", {
        capacityUnitId,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Negotiate with tenant agent for graceful checkpoint/migration.
   */
  private async negotiate(
    leaseId: string,
    reason: ReclaimRequest["reason"],
    gracePeriodMs: number
  ): Promise<boolean> {
    const controller = new AbortController();
    this.activeNegotiations.set(leaseId, controller);

    try {
      const lease = await getLease(leaseId);
      if (!lease) {
        throw new Error(`Lease ${leaseId} not found`);
      }

      // Get agent A2A endpoint
      const agentEndpoint = lease.a2aEndpoint;
      if (!agentEndpoint) {
        log.warn("No A2A endpoint for lease, forcing eviction", { leaseId });
        return await this.forceEvict(leaseId, "no_a2a_endpoint");
      }

      this.emit("negotiationStarted", leaseId, agentEndpoint);

      // Record negotiation start
      await recordAuditEvent({
        eventType: EventType.NEGOTIATION_STARTED,
        source: EventSource.NEGOTIATOR,
        leaseId,
        agentId: lease.tenantAgentId,
        details: { agentEndpoint, gracePeriodMs },
        reasoning: `Started A2A negotiation with agent at ${agentEndpoint}`,
        decisionFactors: ["a2a_negotiation"],
      });

      // Create reclaim request
      const request: ReclaimRequest = {
        type: "reclaim_request",
        lease_id: leaseId,
        grace_period_seconds: Math.floor(gracePeriodMs / 1000),
        reason,
        options: [
          { action: "checkpoint", target: lease.checkpointTargetUri ?? undefined },
          { action: "migrate", target: "cloud_run_worker_pool" },
          { action: "accept_loss" },
        ],
      };

      // Send A2A request to tenant agent
      const response = await this.sendA2ARequest<ReclaimResponse>(
        agentEndpoint,
        request,
        gracePeriodMs,
        controller.signal
      );

      if (!response) {
        log.warn("No response from agent, forcing eviction", { leaseId });
        return await this.forceEvict(leaseId, "no_response");
      }

      // Handle response
      switch (response.chosen_action) {
        case "checkpoint":
          return await this.handleCheckpoint(leaseId, gracePeriodMs);

        case "migrate":
          return await this.handleMigration(leaseId);

        case "accept_loss":
          return await this.handleAcceptLoss(leaseId);

        default:
          log.warn("Unknown action from agent", { leaseId, action: response.chosen_action });
          return await this.forceEvict(leaseId, "unknown_action");
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        log.info("Negotiation cancelled", { leaseId });
        return false;
      }
      log.error("Negotiation failed", { leaseId, error: (error as Error).message });
      return await this.forceEvict(leaseId, "negotiation_error");
    } finally {
      this.activeNegotiations.delete(leaseId);
    }
  }

  /**
   * Send an A2A request to a tenant agent.
   */
  private async sendA2ARequest<T>(
    endpoint: string,
    request: ReclaimRequest,
    timeoutMs: number,
    signal: AbortSignal
  ): Promise<T | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Combine our abort signal with the timeout
      signal.addEventListener("abort", () => controller.abort());

      const response = await fetch(`${endpoint}/a2a/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-A2A-Protocol": "xidr-negotiation/1.0",
        },
        body: JSON.stringify({
          task_type: request.type,
          data: request,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        log.warn("A2A request failed", { endpoint, status: response.status });
        return null;
      }

      const result = (await response.json()) as { data: T };
      return result.data;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        log.debug("A2A request timed out or cancelled", { endpoint });
      } else {
        log.error("A2A request error", { endpoint, error: (error as Error).message });
      }
      return null;
    }
  }

  /**
   * Handle checkpoint action from tenant agent.
   */
  private async handleCheckpoint(leaseId: string, gracePeriodMs: number): Promise<boolean> {
    log.info("Handling checkpoint", { leaseId });

    // Check if already checkpointed (agent may have completed during A2A response)
    const currentLease = await getLease(leaseId);
    if (currentLease?.status === LeaseStatus.CHECKPOINTED) {
      log.info("Checkpoint already completed", { leaseId });

      // Release capacity
      if (currentLease.capacityUnitId) {
        await releaseCapacity(currentLease.capacityUnitId);
      }

      this.emit("checkpointCompleted", leaseId, currentLease.checkpointUri ?? "");
      this.emit("negotiationCompleted", leaseId, "checkpoint");
      return true;
    }

    // Only set to CHECKPOINTING if not already done
    if (currentLease?.status !== LeaseStatus.CHECKPOINTING) {
      await updateLease(leaseId, { status: LeaseStatus.CHECKPOINTING });
    }

    await recordAuditEvent({
      eventType: EventType.CHECKPOINT_STARTED,
      source: EventSource.NEGOTIATOR,
      leaseId,
      details: { gracePeriodMs },
      reasoning: `Agent chose to checkpoint. Waiting up to ${gracePeriodMs}ms.`,
      decisionFactors: ["checkpoint_chosen", `timeout:${gracePeriodMs}ms`],
    });

    // Wait for checkpoint acknowledgement (via API)
    // The tenant agent will call xidr_checkpoint_ack when done
    // Set a timeout to force eviction if not completed in time

    const checkpointTimeout = Math.min(gracePeriodMs, this.config.negotiation.checkpointTimeoutMs);

    const completed = await this.waitForCheckpoint(leaseId, checkpointTimeout);

    if (!completed) {
      log.warn("Checkpoint timeout", { leaseId });
      return await this.forceEvict(leaseId, "checkpoint_timeout");
    }

    // Checkpoint succeeded - release capacity
    const lease = await getLease(leaseId);
    if (lease?.capacityUnitId) {
      await releaseCapacity(lease.capacityUnitId);
    }

    this.emit("checkpointCompleted", leaseId, lease?.checkpointUri ?? "");

    await recordAuditEvent({
      eventType: EventType.NEGOTIATION_COMPLETED,
      source: EventSource.NEGOTIATOR,
      leaseId,
      details: { action: "checkpoint", checkpointUri: lease?.checkpointUri },
      reasoning: "Checkpoint completed successfully. Capacity released.",
      decisionFactors: ["checkpoint_success"],
    });

    this.emit("negotiationCompleted", leaseId, "checkpoint");
    return true;
  }

  /**
   * Wait for checkpoint to complete (polling).
   */
  private async waitForCheckpoint(leaseId: string, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 1000;

    while (Date.now() - startTime < timeoutMs) {
      const lease = await getLease(leaseId);

      if (lease?.status === LeaseStatus.CHECKPOINTED) {
        return true;
      }

      if (lease?.status === LeaseStatus.LOST) {
        return false;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return false;
  }

  /**
   * Handle migration action.
   */
  private async handleMigration(leaseId: string): Promise<boolean> {
    log.info("Handling migration", { leaseId });

    // For MVP, migration means checkpoint + resume on Cloud Run
    // This is simplified - full implementation would coordinate actual migration

    await recordAuditEvent({
      eventType: EventType.NEGOTIATION_COMPLETED,
      source: EventSource.NEGOTIATOR,
      leaseId,
      details: { action: "migrate", target: "cloud_run" },
      reasoning: "Agent chose migration to Cloud Run.",
      decisionFactors: ["migration_chosen", "cloud_run_target"],
    });

    this.emit("negotiationCompleted", leaseId, "migrate");

    // Release current capacity
    const lease = await getLease(leaseId);
    if (lease?.capacityUnitId) {
      await releaseCapacity(lease.capacityUnitId);
    }

    return true;
  }

  /**
   * Handle accept_loss action.
   */
  private async handleAcceptLoss(leaseId: string): Promise<boolean> {
    log.info("Agent accepted state loss", { leaseId });

    await markLeaseLost(leaseId, "preempted");

    const lease = await getLease(leaseId);
    if (lease?.capacityUnitId) {
      await releaseCapacity(lease.capacityUnitId);
    }

    await recordAuditEvent({
      eventType: EventType.LEASE_LOST,
      source: EventSource.NEGOTIATOR,
      leaseId,
      details: { reason: "agent_accepted_loss" },
      reasoning: "Agent chose to accept state loss. No checkpoint created.",
      decisionFactors: ["accept_loss_chosen"],
    });

    this.emit("leaseLost", leaseId, "agent_accepted_loss");
    this.emit("negotiationCompleted", leaseId, "accept_loss");
    return true;
  }

  /**
   * Force eviction when negotiation fails.
   */
  private async forceEvict(leaseId: string, reason: string): Promise<boolean> {
    log.warn("Forcing eviction", { leaseId, reason });

    await markLeaseLost(leaseId, "preempted");

    const lease = await getLease(leaseId);
    if (lease?.capacityUnitId) {
      await releaseCapacity(lease.capacityUnitId);
    }

    await recordAuditEvent({
      eventType: EventType.LEASE_LOST,
      source: EventSource.NEGOTIATOR,
      leaseId,
      details: { reason, forcedEviction: true },
      reasoning: `Forced eviction due to: ${reason}`,
      decisionFactors: ["forced_eviction", reason],
    });

    this.emit("leaseLost", leaseId, reason);
    return true;
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

// Singleton instance
let negotiator: NegotiatorAgent | null = null;

export function getNegotiator(): NegotiatorAgent {
  if (!negotiator) {
    negotiator = new NegotiatorAgent();
  }
  return negotiator;
}

// Main entry point
export async function run(): Promise<void> {
  log.info("Starting Negotiator Agent");

  // Initialize Firestore
  initFirestore();

  const agent = getNegotiator();

  // Handle shutdown
  process.on("SIGINT", () => {
    log.info("Received SIGINT, shutting down");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    log.info("Received SIGTERM, shutting down");
    process.exit(0);
  });

  log.info("Negotiator ready for reclaim requests");

  // Keep process alive
  await new Promise(() => {});
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    log.error("Negotiator failed", { error: err.message });
    process.exit(1);
  });
}
