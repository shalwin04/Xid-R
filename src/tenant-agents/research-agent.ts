/**
 * Research Agent - Toy Tenant Agent for Demo
 *
 * A simulated research agent that:
 * 1. Requests GPU capacity from Xid-R
 * 2. Performs "research" work (simulated)
 * 3. Handles reclaim requests via A2A
 * 4. Checkpoints state when evicted
 * 5. Resumes from checkpoint
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { CheckpointableAgent, CheckpointResult, RestoreResult } from "../checkpoint/sdk.js";
import { CheckpointState } from "../models/checkpoint.js";
import { createLogger } from "../utils/logger.js";
import { ReclaimRequest, ReclaimResponse } from "../agents/negotiator.js";

const log = createLogger({ module: "research-agent" });

interface ResearchTask {
  id: string;
  type: "search" | "summarize" | "analyze";
  query: string;
  status: "pending" | "in_progress" | "completed";
  result?: string;
}

/**
 * Research Agent implementation.
 */
export class ResearchAgent extends CheckpointableAgent {
  private agentId: string;
  private leaseId: string | null = null;
  private xidrEndpoint: string;
  private a2aPort: number;
  private working = false;

  constructor(
    agentId: string,
    xidrEndpoint: string = "http://localhost:8080",
    a2aPort: number = 9001
  ) {
    super("research_agent");
    this.agentId = agentId;
    this.xidrEndpoint = xidrEndpoint;
    this.a2aPort = a2aPort;

    // Initialize state
    this.scratchpad = {
      currentTopic: null,
      notes: [],
      references: [],
    };
  }

  /**
   * Start the agent.
   */
  async start(): Promise<void> {
    log.info("Starting Research Agent", { agentId: this.agentId });

    // Start A2A server for receiving reclaim requests
    this.startA2AServer();

    // Request GPU capacity
    await this.requestGpu();

    // Start working
    this.work();
  }

  /**
   * Start the A2A server for negotiation.
   */
  private startA2AServer(): void {
    const app = new Hono();

    // A2A task endpoint
    app.post("/a2a/tasks", async (c) => {
      const body = await c.req.json();
      log.info("Received A2A task", { taskType: body.task_type });

      if (body.task_type === "reclaim_request") {
        const response = await this.handleReclaimRequest(body.data as ReclaimRequest);
        return c.json({ status: "completed", data: response });
      }

      return c.json({ status: "rejected", error: "Unknown task type" }, 400);
    });

    // Health check
    app.get("/health", (c) => c.json({ status: "ok", agentId: this.agentId }));

    serve({
      fetch: app.fetch,
      port: this.a2aPort,
    });

    log.info("A2A server started", { port: this.a2aPort });
  }

  /**
   * Request GPU capacity from Xid-R.
   */
  private async requestGpu(): Promise<void> {
    try {
      const response = await fetch(`${this.xidrEndpoint}/mcp/tools/xidr_request_gpu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gpu_type: "nvidia-t4",
          duration_hint_seconds: 3600,
          priority: "normal",
          a2a_endpoint: `http://localhost:${this.a2aPort}`,
          checkpointable: true,
          agent_id: this.agentId,
          agent_name: "Research Agent",
        }),
      });

      const result = (await response.json()) as {
        status: string;
        lease_id: string;
        capacity_unit_id?: string;
        queue_position?: number;
      };

      if (result.status === "granted") {
        this.leaseId = result.lease_id;
        log.info("GPU capacity granted", {
          leaseId: this.leaseId,
          capacityUnitId: result.capacity_unit_id,
        });
      } else {
        this.leaseId = result.lease_id;
        log.info("GPU request queued", { leaseId: this.leaseId, position: result.queue_position });
      }
    } catch (error) {
      log.error("Failed to request GPU", { error: (error as Error).message });
    }
  }

  /**
   * Simulate research work.
   */
  private async work(): Promise<void> {
    this.working = true;

    // Add some initial tasks
    this.taskQueue = [
      { id: "task_1", type: "search", status: "pending", data: { query: "GPU utilization in enterprise" } },
      { id: "task_2", type: "summarize", status: "pending", data: { query: "Cast AI research findings" } },
      { id: "task_3", type: "analyze", status: "pending", data: { query: "Spot VM preemption patterns" } },
    ];

    while (this.working && this.taskQueue.length > 0) {
      const task = this.taskQueue.find((t) => t.status === "pending");
      if (!task) break;

      task.status = "in_progress";
      log.info("Working on task", { taskId: task.id, type: task.type });

      // Simulate work
      await this.simulateWork(task);

      task.status = "completed";
      this.incrementApiCalls();
      this.addTokensUsed(Math.floor(Math.random() * 1000));

      this.addToConversation("assistant", `Completed task ${task.id}: ${task.type}`);

      log.info("Task completed", { taskId: task.id });
    }

    if (this.working) {
      log.info("All tasks completed");
      await this.releaseGpu();
    }
  }

  /**
   * Simulate task work with random duration.
   */
  private async simulateWork(task: { id: string; type: string }): Promise<void> {
    const duration = 5000 + Math.random() * 10000; // 5-15 seconds
    await new Promise((resolve) => setTimeout(resolve, duration));

    // Update scratchpad
    (this.scratchpad.notes as string[]).push(`Processed ${task.type} task ${task.id}`);
  }

  /**
   * Handle reclaim request from Negotiator.
   */
  private async handleReclaimRequest(request: ReclaimRequest): Promise<ReclaimResponse> {
    log.warn("Received reclaim request", {
      leaseId: request.lease_id,
      reason: request.reason,
      graceSeconds: request.grace_period_seconds,
    });

    // Stop current work
    this.working = false;

    // Choose to checkpoint
    const response: ReclaimResponse = {
      type: "reclaim_response",
      lease_id: request.lease_id,
      chosen_action: "checkpoint",
      estimated_duration_seconds: Math.ceil(this.getStateSizeEstimate() / 100000), // ~100KB/s
    };

    // Start checkpoint in background
    this.performCheckpoint(request);

    return response;
  }

  /**
   * Perform checkpoint and notify Xid-R.
   */
  private async performCheckpoint(request: ReclaimRequest): Promise<void> {
    const targetUri = request.options.find((o) => o.action === "checkpoint")?.target;

    if (!targetUri) {
      log.error("No checkpoint target provided");
      return;
    }

    const checkpointUri = `${targetUri}checkpoint_${Date.now()}.json`;

    log.info("Starting checkpoint", { uri: checkpointUri });

    const result = await this.checkpoint(checkpointUri);

    if (result.success) {
      // Acknowledge to Xid-R
      await this.acknowledgeCheckpoint(result);
    } else {
      log.error("Checkpoint failed", { error: result.error });
    }
  }

  /**
   * Acknowledge checkpoint completion to Xid-R.
   */
  private async acknowledgeCheckpoint(result: CheckpointResult): Promise<void> {
    try {
      await fetch(`${this.xidrEndpoint}/mcp/tools/xidr_checkpoint_ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lease_id: this.leaseId,
          checkpoint_uri: result.uri,
          size_bytes: result.sizeBytes,
          duration_ms: result.durationMs,
        }),
      });

      log.info("Checkpoint acknowledged", {
        leaseId: this.leaseId,
        uri: result.uri,
        sizeBytes: result.sizeBytes,
      });
    } catch (error) {
      log.error("Failed to acknowledge checkpoint", { error: (error as Error).message });
    }
  }

  /**
   * Release GPU capacity voluntarily.
   */
  private async releaseGpu(): Promise<void> {
    if (!this.leaseId) return;

    try {
      const response = await fetch(`${this.xidrEndpoint}/mcp/tools/xidr_release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lease_id: this.leaseId }),
      });

      const result = (await response.json()) as {
        billable_seconds?: number;
        savings_usd?: number;
      };
      log.info("GPU released", {
        leaseId: this.leaseId,
        billableSeconds: result.billable_seconds,
        savingsUsd: result.savings_usd,
      });

      this.leaseId = null;
    } catch (error) {
      log.error("Failed to release GPU", { error: (error as Error).message });
    }
  }

  /**
   * Resume from a checkpoint.
   */
  async resumeFromCheckpoint(checkpointUri: string): Promise<void> {
    log.info("Resuming from checkpoint", { uri: checkpointUri });

    const result = await this.restore(checkpointUri);

    if (result.success) {
      log.info("State restored", {
        taskQueue: this.taskQueue.length,
        notes: (this.scratchpad.notes as string[]).length,
      });

      // Request new GPU and continue work
      await this.requestGpu();
      this.work();
    } else {
      log.error("Failed to restore state", { error: result.error });
    }
  }

  // CheckpointableAgent implementation

  protected async prepareCheckpoint(): Promise<void> {
    // Update metadata
    this.state.metadata.elapsedTimeSeconds = Math.floor(
      (Date.now() - new Date(this.state.createdAt).getTime()) / 1000
    );
  }

  protected async onCheckpointComplete(uri: string): Promise<void> {
    log.info("Checkpoint saved", { uri });
  }

  protected async onRestoreComplete(state: CheckpointState): Promise<void> {
    log.info("State restored", { taskCount: state.taskQueue.length });
  }
}

// Main entry point
async function main(): Promise<void> {
  const agentId = process.env.AGENT_ID ?? "research_agent_1";
  const xidrEndpoint = process.env.XIDR_ENDPOINT ?? "http://localhost:8080";
  const a2aPort = parseInt(process.env.A2A_PORT ?? "9001", 10);

  const agent = new ResearchAgent(agentId, xidrEndpoint, a2aPort);

  // Handle shutdown
  process.on("SIGINT", () => {
    log.info("Shutting down");
    process.exit(0);
  });

  await agent.start();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    log.error("Agent failed", { error: err.message });
    process.exit(1);
  });
}
