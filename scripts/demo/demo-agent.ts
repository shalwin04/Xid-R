#!/usr/bin/env npx tsx
/**
 * Xid-R Demo Agent
 *
 * A visual AI agent that demonstrates the full Xid-R workflow:
 * - Requests GPU from Xid-R
 * - Shows fake "training" progress
 * - Handles A2A preemption negotiations
 * - Checkpoints and resumes
 *
 * Usage:
 *   npx tsx scripts/demo/demo-agent.ts
 *
 * Environment:
 *   XIDR_API_ENDPOINT - Control plane URL (default: http://localhost:8080)
 *   AGENT_PORT - Port for A2A endpoint (default: 8091)
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

function log(level: string, message: string) {
  const timestamp = new Date().toLocaleTimeString();
  const levelColors: Record<string, string> = {
    INFO: colors.green,
    WARN: colors.yellow,
    ERROR: colors.red,
    EVENT: colors.cyan,
    TRAIN: colors.magenta,
    A2A: colors.blue,
  };
  const color = levelColors[level] || colors.white;
  console.log(`${colors.bold}[${timestamp}]${colors.reset} ${color}[${level}]${colors.reset} ${message}`);
}

function progressBar(current: number, total: number, width = 30): string {
  const percent = current / total;
  const filled = Math.round(width * percent);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `[${bar}] ${Math.round(percent * 100)}%`;
}

// Agent state
interface AgentState {
  currentEpoch: number;
  totalEpochs: number;
  loss: number;
  tasksCompleted: number;
  modelWeights: number[];
}

class DemoAgent {
  private state: AgentState = {
    currentEpoch: 0,
    totalEpochs: 10,
    loss: 1.0,
    tasksCompleted: 0,
    modelWeights: Array(100).fill(0).map(() => Math.random()),
  };

  private apiEndpoint: string;
  private agentPort: number;
  private leaseId: string | null = null;
  private gpuType: string | null = null;
  private running = false;
  private paused = false;
  private checkpointUri: string | null = null;

  constructor() {
    this.apiEndpoint = process.env.XIDR_API_ENDPOINT || "http://localhost:8080";
    this.agentPort = parseInt(process.env.AGENT_PORT || "8091");
  }

  // XidrCheckpointable interface
  async getCheckpointState(): Promise<AgentState> {
    return { ...this.state };
  }

  async restoreFromCheckpoint(state: AgentState): Promise<void> {
    this.state = { ...state };
    log("INFO", `Restored state: Epoch ${this.state.currentEpoch}/${this.state.totalEpochs}`);
  }

  getStateEstimate(): number {
    return JSON.stringify(this.state).length;
  }

  // API calls
  private async apiCall<T>(method: string, path: string, data?: unknown): Promise<T | null> {
    try {
      const response = await fetch(`${this.apiEndpoint}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: data ? JSON.stringify(data) : undefined,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        log("ERROR", `API error: ${JSON.stringify(error)}`);
        return null;
      }

      return await response.json() as T;
    } catch (error) {
      log("ERROR", `API call failed: ${(error as Error).message}`);
      return null;
    }
  }

  // Request GPU from Xid-R
  async requestGpu(): Promise<boolean> {
    log("INFO", "Requesting GPU from Xid-R...");

    const result = await this.apiCall<{
      lease_id: string;
      status: string;
      capacity_unit_id?: string;
      connection_info?: { host: string; gpu_device: string };
    }>("POST", "/mcp/tools/xidr_request_gpu", {
      gpu_type: "nvidia-t4",
      a2a_endpoint: `http://localhost:${this.agentPort}`,
      priority: "normal",
      checkpointable: true,
      agent_id: "demo-research-agent",
      agent_name: "Demo Research Agent",
    });

    if (result && result.lease_id) {
      this.leaseId = result.lease_id;
      this.gpuType = "nvidia-t4";

      console.log("");
      log("INFO", `╔══════════════════════════════════════════════════════════╗`);
      log("INFO", `║  ${colors.green}✓ GPU GRANTED${colors.reset}                                          ║`);
      log("INFO", `║  Lease ID: ${this.leaseId.substring(0, 20)}...                  ║`);
      log("INFO", `║  GPU Type: ${this.gpuType}                                   ║`);
      log("INFO", `║  Status: ${result.status}                                       ║`);
      log("INFO", `╚══════════════════════════════════════════════════════════╝`);
      console.log("");

      return true;
    }

    log("ERROR", "Failed to get GPU");
    return false;
  }

  // Simulate training
  async train(): Promise<void> {
    this.running = true;

    console.log("");
    log("TRAIN", "╔══════════════════════════════════════════════════════════╗");
    log("TRAIN", "║  Starting Model Training                                  ║");
    log("TRAIN", `║  Epochs: ${this.state.totalEpochs}                                                ║`);
    log("TRAIN", "╚══════════════════════════════════════════════════════════╝");
    console.log("");

    while (this.running && this.state.currentEpoch < this.state.totalEpochs) {
      if (this.paused) {
        await this.sleep(100);
        continue;
      }

      this.state.currentEpoch++;
      this.state.loss = Math.max(0.01, this.state.loss * 0.85 + Math.random() * 0.05);
      this.state.tasksCompleted++;

      // Update weights (simulate)
      this.state.modelWeights = this.state.modelWeights.map(w => w + (Math.random() - 0.5) * 0.1);

      const progress = progressBar(this.state.currentEpoch, this.state.totalEpochs);
      const lossStr = this.state.loss.toFixed(4);

      process.stdout.write(`\r${colors.magenta}[TRAIN]${colors.reset} Epoch ${this.state.currentEpoch}/${this.state.totalEpochs} ${progress} Loss: ${lossStr}  `);

      await this.sleep(2000); // 2 seconds per epoch for demo
    }

    if (this.running) {
      console.log("");
      console.log("");
      log("TRAIN", `${colors.green}✓ Training complete!${colors.reset}`);
      log("TRAIN", `Final loss: ${this.state.loss.toFixed(4)}`);
    }
  }

  // Handle A2A reclaim request
  async handleReclaim(request: {
    lease_id: string;
    reason: string;
    grace_period_seconds: number;
    options: Array<{ action: string; target?: string }>;
  }): Promise<{ chosen_action: string; checkpoint_uri?: string }> {
    console.log("");
    console.log("");
    log("A2A", "╔══════════════════════════════════════════════════════════╗");
    log("A2A", `║  ${colors.bgYellow}${colors.bold} ⚠️  PREEMPTION NOTICE RECEIVED! ${colors.reset}                       ║`);
    log("A2A", "╚══════════════════════════════════════════════════════════╝");
    log("A2A", `Reason: ${request.reason}`);
    log("A2A", `Grace period: ${request.grace_period_seconds}s`);
    log("A2A", `Options: ${request.options.map(o => o.action).join(", ")}`);
    console.log("");

    // Pause training
    this.paused = true;

    // Choose checkpoint action
    const checkpointOption = request.options.find(o => o.action === "checkpoint");

    if (checkpointOption && checkpointOption.target) {
      log("A2A", `→ Choosing action: ${colors.cyan}checkpoint${colors.reset}`);
      log("A2A", "");

      // Simulate checkpoint
      log("A2A", "Saving checkpoint...");
      await this.sleep(500);

      const state = await this.getCheckpointState();
      const stateJson = JSON.stringify(state);
      const sizeBytes = stateJson.length;

      log("A2A", `  → Model state: ${(sizeBytes / 1024).toFixed(1)} KB`);
      log("A2A", `  → Current epoch: ${state.currentEpoch}/${state.totalEpochs}`);
      log("A2A", `  → Loss: ${state.loss.toFixed(4)}`);
      await this.sleep(500);

      this.checkpointUri = `${checkpointOption.target}/checkpoint-${Date.now()}.json`;
      log("A2A", `  → Saved to: ${this.checkpointUri}`);
      console.log("");

      log("A2A", `${colors.green}✓ Checkpoint complete!${colors.reset}`);
      console.log("");

      // Acknowledge checkpoint with control plane
      await this.apiCall("POST", "/mcp/tools/xidr_checkpoint_ack", {
        lease_id: this.leaseId,
        checkpoint_uri: this.checkpointUri,
        size_bytes: sizeBytes,
        duration_ms: 1000,
      });

      return {
        chosen_action: "checkpoint",
        checkpoint_uri: this.checkpointUri,
      };
    }

    log("A2A", `→ Choosing action: ${colors.red}accept_loss${colors.reset}`);
    return { chosen_action: "accept_loss" };
  }

  // Handle resume notification
  async handleResume(notification: {
    new_lease_id: string;
    checkpoint_uri: string;
    new_capacity_unit_id: string;
  }): Promise<void> {
    console.log("");
    log("A2A", "╔══════════════════════════════════════════════════════════╗");
    log("A2A", `║  ${colors.bgGreen}${colors.bold} 🔄 RESUME NOTIFICATION ${colors.reset}                               ║`);
    log("A2A", "╚══════════════════════════════════════════════════════════╝");
    log("A2A", `New lease: ${notification.new_lease_id}`);
    log("A2A", `Checkpoint: ${notification.checkpoint_uri}`);
    console.log("");

    // Update lease
    this.leaseId = notification.new_lease_id;

    // Restore from checkpoint (simulated)
    log("A2A", "Restoring from checkpoint...");
    await this.sleep(500);

    // In real implementation, would fetch from GCS
    // For demo, just unpause
    log("A2A", `${colors.green}✓ State restored!${colors.reset}`);
    log("A2A", `Resuming from epoch ${this.state.currentEpoch}/${this.state.totalEpochs}`);
    console.log("");

    this.paused = false;
  }

  // Release GPU
  async release(): Promise<void> {
    if (!this.leaseId) return;

    log("INFO", "Releasing GPU...");

    const result = await this.apiCall<{
      released: boolean;
      billable_seconds: number;
      savings_usd: number;
    }>("POST", "/mcp/tools/xidr_release", {
      lease_id: this.leaseId,
    });

    if (result) {
      log("INFO", `${colors.green}✓ GPU released${colors.reset}`);
      log("INFO", `  Billable time: ${result.billable_seconds}s`);
      log("INFO", `  Savings: $${result.savings_usd.toFixed(2)}`);
    }

    this.leaseId = null;
  }

  // Start A2A server
  startA2AServer(): void {
    const app = new Hono();

    // A2A tasks endpoint
    app.post("/a2a/tasks", async (c) => {
      const body = await c.req.json();
      const { task_type, data } = body;

      if (task_type === "reclaim_request") {
        const response = await this.handleReclaim(data);
        return c.json({ status: "completed", data: response });
      }

      if (task_type === "resume_notification") {
        await this.handleResume(data);
        return c.json({ status: "completed" });
      }

      return c.json({ status: "failed", error: "Unknown task type" }, 400);
    });

    // Health endpoint
    app.get("/a2a/health", (c) => {
      return c.json({
        status: "ok",
        agent_type: "demo-research-agent",
        lease_id: this.leaseId,
        training: this.running && !this.paused,
        epoch: `${this.state.currentEpoch}/${this.state.totalEpochs}`,
      });
    });

    serve({ fetch: app.fetch, port: this.agentPort }, () => {
      log("INFO", `A2A server listening on port ${this.agentPort}`);
    });
  }

  // Main run loop
  async run(): Promise<void> {
    console.clear();
    console.log("");
    console.log(`${colors.bold}${colors.cyan}╔══════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}║                                                          ║${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}║      🤖 Xid-R Demo Agent - Research Workload            ║${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}║                                                          ║${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}╚══════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log("");
    log("INFO", `Control Plane: ${this.apiEndpoint}`);
    log("INFO", `A2A Endpoint: http://localhost:${this.agentPort}`);
    console.log("");

    // Start A2A server
    this.startA2AServer();
    await this.sleep(500);

    // Request GPU
    const hasGpu = await this.requestGpu();
    if (!hasGpu) {
      log("ERROR", "Could not get GPU, exiting");
      process.exit(1);
    }

    // Start training
    await this.train();

    // Release GPU when done
    await this.release();

    console.log("");
    log("INFO", "Demo complete!");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Main
const agent = new DemoAgent();

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("");
  log("INFO", "Shutting down...");
  await agent.release();
  process.exit(0);
});

agent.run().catch((error) => {
  log("ERROR", `Agent error: ${error.message}`);
  process.exit(1);
});
