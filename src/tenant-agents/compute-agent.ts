/**
 * Compute Agent - Second Toy Tenant Agent for Demo
 *
 * A simulated compute agent that runs batch processing tasks.
 * Demonstrates concurrent GPU requests alongside the Research Agent.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { CheckpointableAgent } from "../checkpoint/sdk.js";
import { CheckpointState } from "../models/checkpoint.js";
import { createLogger } from "../utils/logger.js";
import { ReclaimRequest, ReclaimResponse } from "../agents/negotiator.js";

const log = createLogger({ module: "compute-agent" });

interface ComputeJob {
  id: string;
  type: "matrix_multiply" | "inference" | "training_step";
  progress: number; // 0-100
  status: "pending" | "running" | "paused" | "completed";
  iterations: number;
  currentIteration: number;
}

/**
 * Compute Agent implementation.
 */
export class ComputeAgent extends CheckpointableAgent {
  private agentId: string;
  private leaseId: string | null = null;
  private xidrEndpoint: string;
  private a2aPort: number;
  private running = false;
  private currentJob: ComputeJob | null = null;

  constructor(
    agentId: string,
    xidrEndpoint: string = "http://localhost:8080",
    a2aPort: number = 9002
  ) {
    super("compute_agent");
    this.agentId = agentId;
    this.xidrEndpoint = xidrEndpoint;
    this.a2aPort = a2aPort;

    // Initialize state
    this.scratchpad = {
      totalIterationsCompleted: 0,
      gpuMemoryUsedMb: 0,
      batchSize: 32,
    };
  }

  /**
   * Start the agent.
   */
  async start(): Promise<void> {
    log.info("Starting Compute Agent", { agentId: this.agentId });

    // Start A2A server
    this.startA2AServer();

    // Request GPU capacity
    await this.requestGpu();

    // Start computing
    this.runJobs();
  }

  /**
   * Start the A2A server.
   */
  private startA2AServer(): void {
    const app = new Hono();

    app.post("/a2a/tasks", async (c) => {
      const body = await c.req.json();
      log.info("Received A2A task", { taskType: body.task_type });

      if (body.task_type === "reclaim_request") {
        const response = await this.handleReclaimRequest(body.data as ReclaimRequest);
        return c.json({ status: "completed", data: response });
      }

      return c.json({ status: "rejected", error: "Unknown task type" }, 400);
    });

    app.get("/health", (c) =>
      c.json({
        status: "ok",
        agentId: this.agentId,
        currentJob: this.currentJob?.id,
        progress: this.currentJob?.progress,
      })
    );

    serve({
      fetch: app.fetch,
      port: this.a2aPort,
    });

    log.info("A2A server started", { port: this.a2aPort });
  }

  /**
   * Request GPU capacity.
   */
  private async requestGpu(): Promise<void> {
    try {
      const response = await fetch(`${this.xidrEndpoint}/mcp/tools/xidr_request_gpu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gpu_type: "nvidia-l4", // Request L4 for compute
          duration_hint_seconds: 7200, // 2 hours
          priority: "high", // Higher priority for compute workloads
          a2a_endpoint: `http://localhost:${this.a2aPort}`,
          checkpointable: true,
          agent_id: this.agentId,
          agent_name: "Compute Agent",
        }),
      });

      const result = (await response.json()) as {
        status: string;
        lease_id: string;
        capacity_unit_id?: string;
      };

      if (result.status === "granted") {
        this.leaseId = result.lease_id;
        log.info("GPU capacity granted", {
          leaseId: this.leaseId,
          capacityUnitId: result.capacity_unit_id,
        });
      } else {
        this.leaseId = result.lease_id;
        log.info("GPU request queued", { leaseId: this.leaseId });
      }
    } catch (error) {
      log.error("Failed to request GPU", { error: (error as Error).message });
    }
  }

  /**
   * Run compute jobs.
   */
  private async runJobs(): Promise<void> {
    this.running = true;

    // Create jobs
    const jobs: ComputeJob[] = [
      {
        id: "job_matrix_1",
        type: "matrix_multiply",
        progress: 0,
        status: "pending",
        iterations: 100,
        currentIteration: 0,
      },
      {
        id: "job_inference_1",
        type: "inference",
        progress: 0,
        status: "pending",
        iterations: 50,
        currentIteration: 0,
      },
    ];

    this.taskQueue = jobs.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      data: { iterations: j.iterations, currentIteration: j.currentIteration },
    }));

    for (const job of jobs) {
      if (!this.running) break;

      this.currentJob = job;
      job.status = "running";

      log.info("Starting job", { jobId: job.id, type: job.type, iterations: job.iterations });

      while (this.running && job.currentIteration < job.iterations) {
        // Simulate iteration
        await this.simulateIteration(job);

        job.currentIteration++;
        job.progress = Math.round((job.currentIteration / job.iterations) * 100);

        // Update task queue
        const task = this.taskQueue.find((t) => t.id === job.id);
        if (task) {
          task.data = { iterations: job.iterations, currentIteration: job.currentIteration };
        }

        this.incrementApiCalls();
        (this.scratchpad.totalIterationsCompleted as number)++;

        if (job.currentIteration % 10 === 0) {
          log.info("Job progress", {
            jobId: job.id,
            progress: job.progress,
            iteration: job.currentIteration,
          });
        }
      }

      if (this.running) {
        job.status = "completed";
        log.info("Job completed", { jobId: job.id });
      }
    }

    this.currentJob = null;

    if (this.running) {
      log.info("All jobs completed");
      await this.releaseGpu();
    }
  }

  /**
   * Simulate a compute iteration.
   */
  private async simulateIteration(job: ComputeJob): Promise<void> {
    // Simulate varying compute times
    const baseTime = job.type === "training_step" ? 500 : 200;
    const duration = baseTime + Math.random() * 300;
    await new Promise((resolve) => setTimeout(resolve, duration));

    // Simulate memory usage
    this.scratchpad.gpuMemoryUsedMb = 4096 + Math.random() * 2048;
  }

  /**
   * Handle reclaim request.
   */
  private async handleReclaimRequest(request: ReclaimRequest): Promise<ReclaimResponse> {
    log.warn("Received reclaim request", {
      leaseId: request.lease_id,
      reason: request.reason,
      graceSeconds: request.grace_period_seconds,
      currentJobProgress: this.currentJob?.progress,
    });

    // Pause current job
    if (this.currentJob) {
      this.currentJob.status = "paused";
    }
    this.running = false;

    // Choose checkpoint
    const response: ReclaimResponse = {
      type: "reclaim_response",
      lease_id: request.lease_id,
      chosen_action: "checkpoint",
      estimated_duration_seconds: 5, // Compute state is relatively small
    };

    // Perform checkpoint
    this.performCheckpoint(request);

    return response;
  }

  /**
   * Perform checkpoint.
   */
  private async performCheckpoint(request: ReclaimRequest): Promise<void> {
    const targetUri = request.options.find((o) => o.action === "checkpoint")?.target;

    if (!targetUri) {
      log.error("No checkpoint target");
      return;
    }

    const checkpointUri = `${targetUri}checkpoint_${Date.now()}.json`;

    // Save current job state
    if (this.currentJob) {
      this.scratchpad.pausedJob = {
        id: this.currentJob.id,
        type: this.currentJob.type,
        currentIteration: this.currentJob.currentIteration,
        totalIterations: this.currentJob.iterations,
      };
    }

    const result = await this.checkpoint(checkpointUri);

    if (result.success) {
      await this.acknowledgeCheckpoint(result.uri!, result.sizeBytes, result.durationMs);
    }
  }

  /**
   * Acknowledge checkpoint to Xid-R.
   */
  private async acknowledgeCheckpoint(
    uri: string,
    sizeBytes: number,
    durationMs: number
  ): Promise<void> {
    try {
      await fetch(`${this.xidrEndpoint}/mcp/tools/xidr_checkpoint_ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lease_id: this.leaseId,
          checkpoint_uri: uri,
          size_bytes: sizeBytes,
          duration_ms: durationMs,
        }),
      });

      log.info("Checkpoint acknowledged");
    } catch (error) {
      log.error("Failed to acknowledge checkpoint", { error: (error as Error).message });
    }
  }

  /**
   * Release GPU.
   */
  private async releaseGpu(): Promise<void> {
    if (!this.leaseId) return;

    try {
      const response = await fetch(`${this.xidrEndpoint}/mcp/tools/xidr_release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lease_id: this.leaseId }),
      });

      const result = (await response.json()) as { savings_usd?: number };
      log.info("GPU released", { savingsUsd: result.savings_usd });
      this.leaseId = null;
    } catch (error) {
      log.error("Failed to release GPU", { error: (error as Error).message });
    }
  }

  /**
   * Resume from checkpoint.
   */
  async resumeFromCheckpoint(checkpointUri: string): Promise<void> {
    log.info("Resuming from checkpoint", { uri: checkpointUri });

    const result = await this.restore(checkpointUri);

    if (result.success && result.state) {
      // Restore paused job
      const pausedJob = this.scratchpad.pausedJob as {
        id: string;
        type: string;
        currentIteration: number;
        totalIterations: number;
      } | undefined;

      if (pausedJob) {
        this.currentJob = {
          id: pausedJob.id,
          type: pausedJob.type as ComputeJob["type"],
          progress: Math.round((pausedJob.currentIteration / pausedJob.totalIterations) * 100),
          status: "pending",
          iterations: pausedJob.totalIterations,
          currentIteration: pausedJob.currentIteration,
        };
        log.info("Restored paused job", {
          jobId: pausedJob.id,
          resumeFrom: pausedJob.currentIteration,
        });
      }

      await this.requestGpu();
      this.runJobs();
    }
  }

  // CheckpointableAgent implementation

  protected async prepareCheckpoint(): Promise<void> {
    this.state.metadata.elapsedTimeSeconds = Math.floor(
      (Date.now() - new Date(this.state.createdAt).getTime()) / 1000
    );
  }

  protected async onCheckpointComplete(uri: string): Promise<void> {
    log.info("Checkpoint saved", { uri });
  }

  protected async onRestoreComplete(state: CheckpointState): Promise<void> {
    log.info("State restored", {
      totalIterationsCompleted: this.scratchpad.totalIterationsCompleted,
    });
  }
}

// Main entry point
async function main(): Promise<void> {
  const agentId = process.env.AGENT_ID ?? "compute_agent_1";
  const xidrEndpoint = process.env.XIDR_ENDPOINT ?? "http://localhost:8080";
  const a2aPort = parseInt(process.env.A2A_PORT ?? "9002", 10);

  const agent = new ComputeAgent(agentId, xidrEndpoint, a2aPort);

  process.on("SIGINT", () => {
    log.info("Shutting down");
    process.exit(0);
  });

  await agent.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    log.error("Agent failed", { error: err.message });
    process.exit(1);
  });
}
