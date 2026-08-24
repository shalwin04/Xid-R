/**
 * Demo Tenant Agent
 *
 * A sample agent that demonstrates the full Xid-R A2A flow:
 * 1. Requests GPU capacity
 * 2. Maintains checkpointable state
 * 3. Responds to reclaim requests
 * 4. Can checkpoint and resume
 *
 * This is a reference implementation for building agents that integrate
 * with Xid-R.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";

// Import from SDK (using relative path for monorepo)
// In production: import from "@xidr/agent-sdk"
import type { XidrCheckpointable } from "../../packages/agent-sdk/src/checkpoint.js";
import { CheckpointManager } from "../../packages/agent-sdk/src/checkpoint.js";
import { createA2ARoutes } from "../../packages/agent-sdk/src/middleware.js";
import { XidrClient } from "../../packages/agent-sdk/src/client.js";

// ============================================================================
// Agent State
// ============================================================================

interface TaskItem {
  id: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed";
  data: Record<string, unknown>;
  result?: unknown;
  createdAt: string;
  completedAt?: string;
}

interface AgentState {
  /** Task queue */
  tasks: TaskItem[];
  /** Current working task index */
  currentTaskIndex: number;
  /** Scratchpad for intermediate results */
  scratchpad: Record<string, unknown>;
  /** Conversation history */
  history: Array<{ role: string; content: string }>;
  /** Agent metrics */
  metrics: {
    tasksCompleted: number;
    tokensUsed: number;
    totalRunTimeSeconds: number;
  };
  /** Active lease ID */
  leaseId: string | null;
  /** Last checkpoint URI */
  lastCheckpointUri: string | null;
}

// ============================================================================
// Demo Agent Implementation
// ============================================================================

class DemoAgent implements XidrCheckpointable {
  private state: AgentState;
  private startTime: number;
  private running = false;
  private workInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startTime = Date.now();
    this.state = this.createInitialState();
  }

  private createInitialState(): AgentState {
    return {
      tasks: [],
      currentTaskIndex: -1,
      scratchpad: {},
      history: [],
      metrics: {
        tasksCompleted: 0,
        tokensUsed: 0,
        totalRunTimeSeconds: 0,
      },
      leaseId: null,
      lastCheckpointUri: null,
    };
  }

  // ========== XidrCheckpointable Interface ==========

  async getCheckpointState(): Promise<unknown> {
    // Update runtime before checkpointing
    this.state.metrics.totalRunTimeSeconds = Math.floor(
      (Date.now() - this.startTime) / 1000
    );

    return {
      ...this.state,
      checkpointedAt: new Date().toISOString(),
    };
  }

  async restoreFromCheckpoint(state: unknown): Promise<void> {
    const restored = state as AgentState & { checkpointedAt: string };

    this.state = {
      tasks: restored.tasks,
      currentTaskIndex: restored.currentTaskIndex,
      scratchpad: restored.scratchpad,
      history: restored.history,
      metrics: restored.metrics,
      leaseId: null, // Will be set by new lease
      lastCheckpointUri: restored.lastCheckpointUri,
    };

    // Reset start time for new session
    this.startTime = Date.now();

    console.log(`[demo-agent] Restored from checkpoint: ${restored.checkpointedAt}`);
    console.log(`[demo-agent] Tasks: ${this.state.tasks.length}, Completed: ${this.state.metrics.tasksCompleted}`);
  }

  getStateEstimate(): number {
    return JSON.stringify(this.state).length;
  }

  // ========== Agent Methods ==========

  setLeaseId(leaseId: string): void {
    this.state.leaseId = leaseId;
  }

  getLeaseId(): string | null {
    return this.state.leaseId;
  }

  setCheckpointUri(uri: string): void {
    this.state.lastCheckpointUri = uri;
  }

  /**
   * Add a task to the queue.
   */
  addTask(type: string, data: Record<string, unknown>): string {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.state.tasks.push({
      id: taskId,
      type,
      status: "pending",
      data,
      createdAt: new Date().toISOString(),
    });

    console.log(`[demo-agent] Added task: ${taskId} (${type})`);
    return taskId;
  }

  /**
   * Start processing tasks.
   */
  startWork(): void {
    if (this.running) {
      console.log("[demo-agent] Already running");
      return;
    }

    this.running = true;
    console.log("[demo-agent] Started work loop");

    // Simulate work every 2 seconds
    this.workInterval = setInterval(() => this.processNextTask(), 2000);
  }

  /**
   * Stop processing tasks.
   */
  stopWork(): void {
    this.running = false;
    if (this.workInterval) {
      clearInterval(this.workInterval);
      this.workInterval = null;
    }
    console.log("[demo-agent] Stopped work loop");
  }

  /**
   * Process the next pending task.
   */
  private processNextTask(): void {
    // Find next pending task
    const pendingIndex = this.state.tasks.findIndex(t => t.status === "pending");

    if (pendingIndex === -1) {
      // No more tasks, generate a new one
      this.addTask("compute", {
        operation: "matrix_multiply",
        dimensions: [Math.floor(Math.random() * 1000), Math.floor(Math.random() * 1000)],
      });
      return;
    }

    const task = this.state.tasks[pendingIndex];
    this.state.currentTaskIndex = pendingIndex;

    console.log(`[demo-agent] Processing task: ${task.id} (${task.type})`);

    // Mark as running
    task.status = "running";

    // Simulate work (would be real GPU computation)
    setTimeout(() => {
      task.status = "completed";
      task.result = { simulatedOutput: true, duration: 2 };
      task.completedAt = new Date().toISOString();

      this.state.metrics.tasksCompleted++;
      this.state.metrics.tokensUsed += Math.floor(Math.random() * 1000);

      // Add to scratchpad
      this.state.scratchpad[task.id] = task.result;

      // Add to history
      this.state.history.push({
        role: "system",
        content: `Completed task ${task.id}: ${task.type}`,
      });

      // Keep history bounded
      if (this.state.history.length > 100) {
        this.state.history = this.state.history.slice(-100);
      }

      console.log(`[demo-agent] Completed task: ${task.id}`);
    }, 1500);
  }

  /**
   * Get current status.
   */
  getStatus(): {
    running: boolean;
    leaseId: string | null;
    tasksTotal: number;
    tasksCompleted: number;
    tasksPending: number;
    stateSize: number;
  } {
    return {
      running: this.running,
      leaseId: this.state.leaseId,
      tasksTotal: this.state.tasks.length,
      tasksCompleted: this.state.metrics.tasksCompleted,
      tasksPending: this.state.tasks.filter(t => t.status === "pending").length,
      stateSize: this.getStateEstimate(),
    };
  }
}

// ============================================================================
// Agent Server
// ============================================================================

async function main() {
  const PORT = parseInt(process.env.AGENT_PORT ?? "8090", 10);
  const XIDR_URL = process.env.XIDR_API_URL ?? "http://localhost:8080";
  const A2A_ENDPOINT = process.env.A2A_ENDPOINT ?? `http://localhost:${PORT}`;

  console.log("[demo-agent] Starting Demo Agent");
  console.log(`[demo-agent] Port: ${PORT}`);
  console.log(`[demo-agent] Xid-R API: ${XIDR_URL}`);
  console.log(`[demo-agent] A2A Endpoint: ${A2A_ENDPOINT}`);

  // Create agent and managers
  const agent = new DemoAgent();
  const useGCS = process.env.USE_GCS_CHECKPOINTS === "true";
  const checkpointManager = new CheckpointManager({
    agentType: "demo-agent",
    bucket: process.env.CHECKPOINT_BUCKET ?? "xidr-demo-checkpoints",
  });
  const xidrClient = new XidrClient({ baseUrl: XIDR_URL });

  console.log(`[demo-agent] Checkpoint storage: GCS (bucket: ${process.env.CHECKPOINT_BUCKET ?? "xidr-demo-checkpoints"})`);

  // Create Hono app
  const app = new Hono();

  // Middleware
  app.use("*", honoLogger());

  // Health check
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      agent: "demo-agent",
      ...agent.getStatus(),
    });
  });

  // Mount A2A routes (handles /a2a/tasks)
  app.route("/a2a", createA2ARoutes({
    agent,
    checkpointManager,
    agentType: "demo-agent",
    logger: (msg, data) => console.log(`[a2a] ${msg}`, data ?? ""),
    // Custom reclaim handler to acknowledge checkpoint
    onReclaim: async (request, ctx) => {
      ctx.log("Handling reclaim request", { lease_id: request.lease_id });

      // Stop work
      agent.stopWork();

      // Find checkpoint option
      const checkpointOption = request.options.find(o => o.action === "checkpoint");

      if (checkpointOption?.target) {
        const stateSize = agent.getStateEstimate();
        const estimatedSeconds = Math.ceil(stateSize / (1024 * 1024) * 2);

        ctx.log("Starting checkpoint", {
          target: checkpointOption.target,
          estimated_seconds: estimatedSeconds,
        });

        // Perform checkpoint (CheckpointManager takes 3 args, agentType is set in constructor)
        const result = await checkpointManager.checkpoint(
          agent,
          checkpointOption.target,
          request.lease_id
        );

        if (result.success) {
          agent.setCheckpointUri(result.uri!);

          // Acknowledge checkpoint to Xid-R
          try {
            await xidrClient.checkpointAck({
              lease_id: request.lease_id,
              checkpoint_uri: result.uri!,
              size_bytes: result.size_bytes,
              duration_ms: result.duration_ms,
            });
            ctx.log("Checkpoint acknowledged", { uri: result.uri });
          } catch (error) {
            ctx.log("Failed to acknowledge checkpoint", { error: (error as Error).message });
          }

          return {
            type: "reclaim_response" as const,
            lease_id: request.lease_id,
            chosen_action: "checkpoint" as const,
            estimated_duration_seconds: estimatedSeconds,
          };
        } else {
          ctx.log("Checkpoint failed", { error: result.error });
        }
      }

      // No checkpoint or failed - accept loss
      ctx.log("Accepting loss - no checkpoint available or checkpoint failed");
      return {
        type: "reclaim_response" as const,
        lease_id: request.lease_id,
        chosen_action: "accept_loss" as const,
      };
    },
    // Custom resume handler
    onResume: async (notification, ctx) => {
      ctx.log("Handling resume notification", {
        new_lease_id: notification.new_lease_id,
        checkpoint_uri: notification.checkpoint_uri,
      });

      // Restore state
      const result = await ctx.checkpointManager.restore(
        agent,
        notification.checkpoint_uri
      );

      if (result.success) {
        agent.setLeaseId(notification.new_lease_id);
        agent.startWork();
        ctx.log("Resumed successfully");
      } else {
        ctx.log("Failed to restore", { error: result.error });
      }
    },
  }));

  // Agent control endpoints
  app.post("/start", async (c) => {
    const body = await c.req.json().catch(() => ({})) as { gpu_type?: string };
    const gpuType = body.gpu_type ?? "nvidia-t4";

    try {
      // Request GPU from Xid-R
      console.log(`[demo-agent] Requesting ${gpuType} GPU`);

      const lease = await xidrClient.requestGpu({
        gpu_type: gpuType as "nvidia-t4" | "nvidia-l4" | "nvidia-a100-40gb" | "nvidia-a100-80gb",
        a2a_endpoint: A2A_ENDPOINT,
        priority: "normal",
        duration_hint_seconds: 3600,
        checkpointable: true,
      });

      agent.setLeaseId(lease.lease_id);
      console.log(`[demo-agent] Got lease: ${lease.lease_id}, status: ${lease.status}`);

      if (lease.status === "granted") {
        // Start work immediately
        agent.startWork();

        // Add some initial tasks
        agent.addTask("init", { action: "initialize_model" });
        agent.addTask("compute", { action: "warmup" });
      }

      return c.json({
        success: true,
        lease_id: lease.lease_id,
        status: lease.status,
        queue_position: lease.queue_position,
      });
    } catch (error) {
      console.error("[demo-agent] Failed to start", error);
      return c.json({
        success: false,
        error: (error as Error).message,
      }, 500);
    }
  });

  app.post("/stop", async (c) => {
    const leaseId = agent.getLeaseId();

    agent.stopWork();

    if (leaseId) {
      try {
        const release = await xidrClient.release({ lease_id: leaseId });
        console.log(`[demo-agent] Released lease: ${leaseId}`, release);

        return c.json({
          success: true,
          lease_id: leaseId,
          billing: {
            billable_seconds: release.billable_seconds,
            savings_usd: release.savings_usd,
          },
        });
      } catch (error) {
        console.error("[demo-agent] Failed to release", error);
      }
    }

    return c.json({ success: true, lease_id: leaseId });
  });

  app.get("/status", (c) => {
    return c.json(agent.getStatus());
  });

  app.post("/task", async (c) => {
    const body = await c.req.json() as { type: string; data?: Record<string, unknown> };
    const taskId = agent.addTask(body.type, body.data ?? {});
    return c.json({ task_id: taskId });
  });

  // Start server
  serve({
    fetch: app.fetch,
    port: PORT,
  });

  console.log(`[demo-agent] Server listening on http://localhost:${PORT}`);
  console.log("[demo-agent] Endpoints:");
  console.log("  POST /start - Request GPU and start work");
  console.log("  POST /stop  - Stop and release GPU");
  console.log("  GET  /status - Get agent status");
  console.log("  POST /task   - Add a task");
  console.log("  POST /a2a/tasks - A2A endpoint (called by Xid-R)");
}

// Handle shutdown
process.on("SIGINT", () => {
  console.log("[demo-agent] Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[demo-agent] Shutting down...");
  process.exit(0);
});

// Run
main().catch((err) => {
  console.error("[demo-agent] Fatal error:", err);
  process.exit(1);
});
