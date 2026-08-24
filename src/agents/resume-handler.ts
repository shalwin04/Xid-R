/**
 * Resume Handler
 *
 * Watches for checkpointed leases and coordinates their resumption on new capacity.
 *
 * Flow:
 * 1. Monitors leases in CHECKPOINTED status
 * 2. Creates new lease request with checkpoint reference
 * 3. When new capacity is granted, sends A2A resume notification to agent
 * 4. Tracks resume success/failure
 */

import { EventEmitter } from "eventemitter3";

import { getConfig } from "../config.js";
import { createLogger } from "../utils/logger.js";
import {
  getCheckpointedLeases,
  createLease,
  getLease,
  updateLease,
  simpleCompleteLease,
} from "../db/leases.js";
import { recordAuditEvent } from "../db/audit.js";
import { getAgentCard } from "../db/agents.js";
import { EventType, EventSource } from "../models/audit.js";
import { LeaseStatus } from "../models/lease.js";
import { initFirestore } from "../db/firestore.js";

const log = createLogger({ module: "resume-handler" });

export interface ResumeNotification {
  type: "resume_notification";
  lease_id: string;
  new_lease_id: string;
  checkpoint_uri: string;
  connection_info: {
    host: string;
    port: number;
    gpu_device: string;
  };
}

export interface ResumeHandlerEvents {
  resumeQueued: (originalLeaseId: string, newLeaseId: string) => void;
  resumeStarted: (leaseId: string) => void;
  resumeCompleted: (leaseId: string, success: boolean) => void;
}

export class ResumeHandler extends EventEmitter<ResumeHandlerEvents> {
  private config = getConfig();
  private running = false;
  private pollHandle: NodeJS.Timeout | null = null;

  // Track leases being resumed
  private pendingResumes = new Map<string, {
    originalLeaseId: string;
    checkpointUri: string;
    a2aEndpoint: string;
    queuedAt: Date;
  }>();

  /**
   * Start the resume handler.
   */
  start(intervalMs = 5000): void {
    if (this.running) {
      log.warn("Resume handler already running");
      return;
    }

    this.running = true;
    log.info("Resume handler started", { intervalMs });

    // Run immediately, then on interval
    this.processCheckpointedLeases();
    this.pollHandle = setInterval(
      () => this.processCheckpointedLeases(),
      intervalMs
    );
  }

  /**
   * Stop the resume handler.
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    log.info("Resume handler stopped");
  }

  /**
   * Process leases in CHECKPOINTED status.
   */
  private async processCheckpointedLeases(): Promise<void> {
    try {
      const checkpointedLeases = await getCheckpointedLeases();

      for (const lease of checkpointedLeases) {
        // Skip if already being processed
        if (this.pendingResumes.has(lease.id)) {
          continue;
        }

        // Skip if no checkpoint URI
        if (!lease.checkpointUri) {
          log.warn("Checkpointed lease has no checkpoint URI", { leaseId: lease.id });
          continue;
        }

        // Skip if no A2A endpoint
        if (!lease.a2aEndpoint) {
          log.warn("Checkpointed lease has no A2A endpoint", { leaseId: lease.id });
          // Mark as completed (can't resume)
          await simpleCompleteLease(lease.id);
          continue;
        }

        log.info("Queueing lease for resume", {
          originalLeaseId: lease.id,
          gpuType: lease.gpuType,
        });

        // Create a new lease request for resumption
        await this.queueResume(lease);
      }

      // Check pending resumes for granted capacity
      await this.checkPendingResumes();
    } catch (error) {
      log.error("Failed to process checkpointed leases", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Queue a checkpointed lease for resumption.
   */
  private async queueResume(originalLease: {
    id: string;
    tenantAgentId: string;
    gpuType: string;
    checkpointUri: string | null;
    a2aEndpoint: string | null;
    priority: string;
  }): Promise<void> {
    try {
      // Create new lease request
      const newLease = await createLease({
        tenantAgentId: originalLease.tenantAgentId,
        gpuType: originalLease.gpuType,
        durationHintSeconds: 3600,
        priority: originalLease.priority as "low" | "normal" | "high",
        a2aEndpoint: originalLease.a2aEndpoint ?? undefined,
        checkpointable: true,
      });

      // Track the pending resume
      this.pendingResumes.set(newLease.id, {
        originalLeaseId: originalLease.id,
        checkpointUri: originalLease.checkpointUri!,
        a2aEndpoint: originalLease.a2aEndpoint!,
        queuedAt: new Date(),
      });

      // Mark original lease as RESUMING
      await updateLease(originalLease.id, { status: LeaseStatus.RESUMING });

      // Record audit event
      await recordAuditEvent({
        eventType: EventType.RESUME_STARTED,
        source: EventSource.SCHEDULER,
        leaseId: originalLease.id,
        details: {
          newLeaseId: newLease.id,
          checkpointUri: originalLease.checkpointUri,
        },
        reasoning: `Queued resume request as lease ${newLease.id}`,
        decisionFactors: ["checkpoint_available", "resume_queued"],
      });

      this.emit("resumeQueued", originalLease.id, newLease.id);

      log.info("Resume queued", {
        originalLeaseId: originalLease.id,
        newLeaseId: newLease.id,
      });
    } catch (error) {
      log.error("Failed to queue resume", {
        originalLeaseId: originalLease.id,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Check pending resumes for granted capacity.
   */
  private async checkPendingResumes(): Promise<void> {
    for (const [newLeaseId, resumeInfo] of this.pendingResumes) {
      try {
        const newLease = await getLease(newLeaseId);

        if (!newLease) {
          // Lease was deleted or doesn't exist
          this.pendingResumes.delete(newLeaseId);
          continue;
        }

        // Check if new lease was granted
        if (newLease.status === LeaseStatus.ACTIVE) {
          log.info("Resume capacity granted, notifying agent", {
            newLeaseId,
            originalLeaseId: resumeInfo.originalLeaseId,
          });

          this.emit("resumeStarted", newLeaseId);

          // Send resume notification to agent
          const success = await this.sendResumeNotification(
            newLease,
            resumeInfo
          );

          if (success) {
            // Mark original lease as completed
            await simpleCompleteLease(resumeInfo.originalLeaseId);

            await recordAuditEvent({
              eventType: EventType.RESUME_COMPLETED,
              source: EventSource.SCHEDULER,
              leaseId: newLeaseId,
              details: {
                originalLeaseId: resumeInfo.originalLeaseId,
                checkpointUri: resumeInfo.checkpointUri,
              },
              reasoning: "Agent resumed from checkpoint on new capacity",
              decisionFactors: ["resume_success"],
            });

            log.info("Resume completed", {
              newLeaseId,
              originalLeaseId: resumeInfo.originalLeaseId,
            });
          } else {
            await recordAuditEvent({
              eventType: EventType.RESUME_COMPLETED,
              source: EventSource.SCHEDULER,
              leaseId: newLeaseId,
              details: {
                originalLeaseId: resumeInfo.originalLeaseId,
                success: false,
              },
              reasoning: "Agent failed to resume from checkpoint",
              decisionFactors: ["resume_failed"],
            });

            log.warn("Resume notification failed", {
              newLeaseId,
              originalLeaseId: resumeInfo.originalLeaseId,
            });
          }

          this.emit("resumeCompleted", newLeaseId, success);
          this.pendingResumes.delete(newLeaseId);
        }

        // Check for timeout (10 minutes in queue)
        const queuedMs = Date.now() - resumeInfo.queuedAt.getTime();
        if (queuedMs > 10 * 60 * 1000) {
          log.warn("Resume queue timeout", {
            newLeaseId,
            originalLeaseId: resumeInfo.originalLeaseId,
            queuedMs,
          });

          await simpleCompleteLease(resumeInfo.originalLeaseId);
          this.pendingResumes.delete(newLeaseId);
        }
      } catch (error) {
        log.error("Failed to check pending resume", {
          newLeaseId,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Send resume notification to tenant agent.
   */
  private async sendResumeNotification(
    newLease: {
      id: string;
      connectionHost: string | null;
      connectionPort: number | null;
      gpuDevice: string | null;
    },
    resumeInfo: {
      originalLeaseId: string;
      checkpointUri: string;
      a2aEndpoint: string;
    }
  ): Promise<boolean> {
    try {
      const notification: ResumeNotification = {
        type: "resume_notification",
        lease_id: resumeInfo.originalLeaseId,
        new_lease_id: newLease.id,
        checkpoint_uri: resumeInfo.checkpointUri,
        connection_info: {
          host: newLease.connectionHost ?? "localhost",
          port: newLease.connectionPort ?? 8080,
          gpu_device: newLease.gpuDevice ?? "/dev/nvidia0",
        },
      };

      const response = await fetch(`${resumeInfo.a2aEndpoint}/a2a/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-A2A-Protocol": "xidr-negotiation/1.0",
        },
        body: JSON.stringify({
          task_type: "resume_notification",
          data: notification,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        log.warn("Resume notification failed", {
          endpoint: resumeInfo.a2aEndpoint,
          status: response.status,
        });
        return false;
      }

      const result = await response.json() as { status: string };
      return result.status === "completed";
    } catch (error) {
      log.error("Failed to send resume notification", {
        endpoint: resumeInfo.a2aEndpoint,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Get current status.
   */
  getStatus(): {
    running: boolean;
    pendingResumes: number;
  } {
    return {
      running: this.running,
      pendingResumes: this.pendingResumes.size,
    };
  }
}

// Singleton instance
let handler: ResumeHandler | null = null;

export function getResumeHandler(): ResumeHandler {
  if (!handler) {
    handler = new ResumeHandler();
  }
  return handler;
}

// Main entry point
export async function run(): Promise<void> {
  log.info("Starting Resume Handler");

  // Initialize Firestore
  initFirestore();

  const resumeHandler = getResumeHandler();

  // Handle shutdown
  process.on("SIGINT", () => {
    log.info("Received SIGINT, shutting down");
    resumeHandler.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    log.info("Received SIGTERM, shutting down");
    resumeHandler.stop();
    process.exit(0);
  });

  // Start handler
  resumeHandler.start(5000);

  // Keep process alive
  await new Promise(() => {});
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    log.error("Resume handler failed", { error: err.message });
    process.exit(1);
  });
}
