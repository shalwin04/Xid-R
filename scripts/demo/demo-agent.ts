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
    totalEpochs: 30, // Longer for demo - gives time to trigger preemption
    loss: 1.0,
    tasksCompleted: 0,
    modelWeights: Array(100).fill(0).map(() => Math.random()),
  };

  private capacityUnitId: string | null = null;

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
      this.capacityUnitId = result.capacity_unit_id || null;

      console.log("");
      log("INFO", `╔══════════════════════════════════════════════════════════╗`);
      log("INFO", `║  ${colors.green}✓ GPU GRANTED${colors.reset}                                          ║`);
      log("INFO", `║  Lease ID: ${this.leaseId}                      ║`);
      log("INFO", `║  GPU Type: ${this.gpuType}                                   ║`);
      log("INFO", `║  Status: ${result.status}                                       ║`);
      log("INFO", `╚══════════════════════════════════════════════════════════╝`);
      console.log("");

      // Show preemption command for demo
      if (this.capacityUnitId) {
        log("INFO", `${colors.yellow}To trigger preemption (run in another terminal):${colors.reset}`);
        log("INFO", `curl -X POST "${this.apiEndpoint}/api/system/preemption/trigger" \\`);
        log("INFO", `  -H "Content-Type: application/json" \\`);
        log("INFO", `  -d '{"capacity_unit_id":"${this.capacityUnitId}","reason":"spot_preemption"}'`);
        console.log("");
      }

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

      await this.sleep(3000); // 3 seconds per epoch for demo (gives time to trigger preemption)
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
    // Pause training immediately
    this.paused = true;

    // Clear the training progress line and show interruption
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    console.log("");
    log("TRAIN", `${colors.bgRed}${colors.bold} ⏸️  TRAINING PAUSED - PREEMPTION SIGNAL ${colors.reset}`);
    console.log("");
    log("A2A", "╔══════════════════════════════════════════════════════════╗");
    log("A2A", `║  ${colors.bgRed}${colors.bold} ⚠️  PREEMPTION NOTICE RECEIVED! ${colors.reset}                       ║`);
    log("A2A", "╚══════════════════════════════════════════════════════════╝");
    console.log("");

    // Step 1: Analyze request
    log("A2A", `${colors.yellow}[Step 1/4]${colors.reset} Analyzing reclaim request...`);
    await this.sleep(800);
    log("A2A", `  • Lease ID: ${colors.cyan}${request.lease_id}${colors.reset}`);
    log("A2A", `  • Reason: ${colors.red}${request.reason}${colors.reset}`);
    log("A2A", `  • Grace Period: ${colors.yellow}${request.grace_period_seconds}s${colors.reset}`);
    console.log("");

    // Step 2: Evaluate options
    log("A2A", `${colors.yellow}[Step 2/4]${colors.reset} Evaluating available actions...`);
    await this.sleep(800);
    for (const opt of request.options) {
      const icon = opt.action === 'checkpoint' ? '✓' : opt.action === 'migrate' ? '↗' : '✗';
      const color = opt.action === 'checkpoint' ? colors.green : opt.action === 'migrate' ? colors.blue : colors.red;
      log("A2A", `  ${color}${icon} ${opt.action}${colors.reset}${opt.target ? ` → ${opt.target.substring(0, 40)}...` : ''}`);
    }
    console.log("");

    // Choose checkpoint action
    const checkpointOption = request.options.find(o => o.action === "checkpoint");

    if (checkpointOption && checkpointOption.target) {
      // Step 3: Execute checkpoint
      log("A2A", `${colors.yellow}[Step 3/4]${colors.reset} ${colors.bold}Choosing action: CHECKPOINT${colors.reset}`);
      await this.sleep(500);
      console.log("");

      log("A2A", `${colors.cyan}Serializing agent state...${colors.reset}`);
      await this.sleep(600);

      const state = await this.getCheckpointState();
      const stateJson = JSON.stringify(state);
      const sizeBytes = stateJson.length;

      log("A2A", `  ${colors.green}✓${colors.reset} Model weights: ${state.modelWeights.length} parameters`);
      await this.sleep(300);
      log("A2A", `  ${colors.green}✓${colors.reset} Training state: epoch ${state.currentEpoch}/${state.totalEpochs}`);
      await this.sleep(300);
      log("A2A", `  ${colors.green}✓${colors.reset} Current loss: ${state.loss.toFixed(4)}`);
      await this.sleep(300);
      log("A2A", `  ${colors.green}✓${colors.reset} Total size: ${(sizeBytes / 1024).toFixed(1)} KB`);
      console.log("");

      log("A2A", `${colors.cyan}Uploading to Google Cloud Storage...${colors.reset}`);
      await this.sleep(800);

      this.checkpointUri = `${checkpointOption.target}/checkpoint-${Date.now()}.json`;
      log("A2A", `  ${colors.green}✓${colors.reset} Saved to: ${colors.dim}${this.checkpointUri}${colors.reset}`);
      console.log("");

      // Step 4: Notify control plane
      log("A2A", `${colors.yellow}[Step 4/4]${colors.reset} Sending checkpoint acknowledgment to Control Plane...`);
      await this.sleep(500);

      await this.apiCall("POST", "/mcp/tools/xidr_checkpoint_ack", {
        lease_id: this.leaseId,
        checkpoint_uri: this.checkpointUri,
        size_bytes: sizeBytes,
        duration_ms: 1000,
      });

      log("A2A", `  ${colors.green}✓${colors.reset} Control Plane notified`);
      console.log("");

      log("A2A", "╔══════════════════════════════════════════════════════════╗");
      log("A2A", `║  ${colors.bgGreen}${colors.bold} ✓ CHECKPOINT COMPLETE - GPU RELEASED ${colors.reset}                  ║`);
      log("A2A", "╚══════════════════════════════════════════════════════════╝");
      log("A2A", `${colors.dim}Agent can resume on new GPU with preserved state${colors.reset}`);
      console.log("");

      return {
        chosen_action: "checkpoint",
        checkpoint_uri: this.checkpointUri,
      };
    }

    log("A2A", `${colors.yellow}[Step 3/4]${colors.reset} ${colors.red}No checkpoint target - accepting state loss${colors.reset}`);
    return { chosen_action: "accept_loss" };
  }

  // Simulate resume on new capacity
  async simulateResume(): Promise<void> {
    await this.sleep(1500);

    console.log("");
    log("A2A", `${colors.bgBlue}${colors.bold} ◀◀◀ INCOMING A2A MESSAGE ◀◀◀ ${colors.reset}`);
    log("A2A", `${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    log("A2A", `${colors.cyan}From:${colors.reset} Xid-R Control Plane (Scheduler Agent)`);
    log("A2A", `${colors.cyan}Task Type:${colors.reset} resume_notification`);
    log("A2A", `${colors.cyan}Payload:${colors.reset}`);
    const resumePayload = {
      new_lease_id: `lease_${Math.random().toString(36).substring(2, 10)}`,
      checkpoint_uri: this.checkpointUri,
      new_capacity_unit_id: "unit_cloud_run_worker_xidr-worker-1",
      gpu_type: "nvidia-l4"
    };
    console.log(colors.dim + JSON.stringify(resumePayload, null, 2).split('\n').map(l => '  ' + l).join('\n') + colors.reset);
    log("A2A", `${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log("");

    log("A2A", "╔══════════════════════════════════════════════════════════╗");
    log("A2A", `║  ${colors.bgCyan}${colors.bold} 🔄 RESUME NOTIFICATION RECEIVED ${colors.reset}                       ║`);
    log("A2A", "╚══════════════════════════════════════════════════════════╝");
    console.log("");

    log("A2A", `${colors.yellow}[Step 1/3]${colors.reset} Connecting to new capacity...`);
    await this.sleep(800);
    log("A2A", `  ${colors.green}✓${colors.reset} New GPU: ${colors.cyan}nvidia-l4${colors.reset} (Cloud Run Worker)`);
    log("A2A", `  ${colors.green}✓${colors.reset} New Lease: ${colors.cyan}${resumePayload.new_lease_id}${colors.reset}`);
    console.log("");

    log("A2A", `${colors.yellow}[Step 2/3]${colors.reset} Restoring checkpoint from GCS...`);
    await this.sleep(1000);
    log("A2A", `  ${colors.green}✓${colors.reset} Downloaded: ${colors.dim}${this.checkpointUri}${colors.reset}`);
    log("A2A", `  ${colors.green}✓${colors.reset} Model weights restored: 100 parameters`);
    log("A2A", `  ${colors.green}✓${colors.reset} Training state: epoch ${this.state.currentEpoch}/${this.state.totalEpochs}`);
    log("A2A", `  ${colors.green}✓${colors.reset} Loss: ${this.state.loss.toFixed(4)}`);
    console.log("");

    log("A2A", `${colors.yellow}[Step 3/3]${colors.reset} Resuming training...`);
    await this.sleep(500);

    // Update lease
    this.leaseId = resumePayload.new_lease_id;
    this.paused = false;
    this.running = true;

    console.log("");
    log("A2A", "╔══════════════════════════════════════════════════════════╗");
    log("A2A", `║  ${colors.bgGreen}${colors.bold} ✓ AGENT RESUMED ON NEW GPU ${colors.reset}                            ║`);
    log("A2A", "╚══════════════════════════════════════════════════════════╝");
    console.log("");

    log("TRAIN", "╔══════════════════════════════════════════════════════════╗");
    log("TRAIN", `║  ${colors.green}Resuming Training from Epoch ${this.state.currentEpoch}${colors.reset}                          ║`);
    log("TRAIN", "╚══════════════════════════════════════════════════════════╝");
    console.log("");

    // Continue training from where we left off
    while (this.running && this.state.currentEpoch < this.state.totalEpochs) {
      if (this.paused) {
        await this.sleep(100);
        continue;
      }

      this.state.currentEpoch++;
      this.state.loss = Math.max(0.01, this.state.loss * 0.85 + Math.random() * 0.05);
      this.state.tasksCompleted++;

      this.state.modelWeights = this.state.modelWeights.map(w => w + (Math.random() - 0.5) * 0.1);

      const progress = progressBar(this.state.currentEpoch, this.state.totalEpochs);
      const lossStr = this.state.loss.toFixed(4);

      process.stdout.write(`\r${colors.magenta}[TRAIN]${colors.reset} Epoch ${this.state.currentEpoch}/${this.state.totalEpochs} ${progress} Loss: ${lossStr}  `);

      await this.sleep(1500); // Faster for resumed training (1.5s per epoch)
    }

    if (this.running) {
      console.log("");
      console.log("");
      log("TRAIN", `${colors.green}✓ Training complete!${colors.reset}`);
      log("TRAIN", `Final loss: ${this.state.loss.toFixed(4)}`);
      log("TRAIN", `${colors.cyan}Total epochs: ${this.state.totalEpochs} (including ${this.state.currentEpoch > 10 ? this.state.currentEpoch - 10 : this.state.currentEpoch} after resume)${colors.reset}`);
    }
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

      // Show incoming A2A message
      console.log("");
      console.log("");
      log("A2A", `${colors.bgBlue}${colors.bold} ◀◀◀ INCOMING A2A MESSAGE ◀◀◀ ${colors.reset}`);
      log("A2A", `${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      log("A2A", `${colors.cyan}Task Type:${colors.reset} ${task_type}`);
      log("A2A", `${colors.cyan}Payload:${colors.reset}`);
      console.log(colors.dim + JSON.stringify(data, null, 2).split('\n').map(l => '  ' + l).join('\n') + colors.reset);
      log("A2A", `${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);

      if (task_type === "reclaim_request") {
        const response = await this.handleReclaim(data);

        // Show outgoing A2A response
        console.log("");
        log("A2A", `${colors.bgGreen}${colors.bold} ▶▶▶ OUTGOING A2A RESPONSE ▶▶▶ ${colors.reset}`);
        log("A2A", `${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
        log("A2A", `${colors.green}Status:${colors.reset} completed`);
        log("A2A", `${colors.green}Response:${colors.reset}`);
        console.log(colors.dim + JSON.stringify(response, null, 2).split('\n').map(l => '  ' + l).join('\n') + colors.reset);
        log("A2A", `${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
        console.log("");

        // Stop the main training loop (resume happens in handleReclaim)
        this.running = false;

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

    // Local preemption trigger endpoint (for demo)
    app.post("/trigger-preemption", async (c) => {
      if (!this.leaseId || !this.running) {
        return c.json({ error: "No active training" }, 400);
      }
      await this.simulatePreemption();
      return c.json({ success: true });
    });

    serve({ fetch: app.fetch, port: this.agentPort }, () => {
      log("INFO", `A2A server listening on port ${this.agentPort}`);
    });
  }

  // Simulate preemption locally (for demo when Cloud Run can't reach localhost)
  async simulatePreemption(): Promise<void> {
    if (!this.leaseId || !this.running) return;

    const mockRequest = {
      lease_id: this.leaseId,
      reason: "spot_preemption",
      grace_period_seconds: 120,
      options: [
        { action: "checkpoint", target: `gs://xidr-demo-checkpoints/${this.leaseId}` },
        { action: "migrate", target: "cloud_run_worker_pool" },
        { action: "accept_loss" }
      ]
    };

    // Show incoming A2A message
    console.log("");
    console.log("");
    log("A2A", `${colors.bgBlue}${colors.bold} ◀◀◀ INCOMING A2A MESSAGE ◀◀◀ ${colors.reset}`);
    log("A2A", `${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    log("A2A", `${colors.cyan}From:${colors.reset} Xid-R Control Plane (Negotiator Agent)`);
    log("A2A", `${colors.cyan}Task Type:${colors.reset} reclaim_request`);
    log("A2A", `${colors.cyan}Payload:${colors.reset}`);
    console.log(colors.dim + JSON.stringify(mockRequest, null, 2).split('\n').map(l => '  ' + l).join('\n') + colors.reset);
    log("A2A", `${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);

    const response = await this.handleReclaim(mockRequest);

    // Show outgoing A2A response
    console.log("");
    log("A2A", `${colors.bgGreen}${colors.bold} ▶▶▶ OUTGOING A2A RESPONSE ▶▶▶ ${colors.reset}`);
    log("A2A", `${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    log("A2A", `${colors.green}To:${colors.reset} Xid-R Control Plane`);
    log("A2A", `${colors.green}Status:${colors.reset} completed`);
    log("A2A", `${colors.green}Response:${colors.reset}`);
    console.log(colors.dim + JSON.stringify(response, null, 2).split('\n').map(l => '  ' + l).join('\n') + colors.reset);
    log("A2A", `${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log("");

    // Now simulate the resume flow
    await this.simulateResume();
  }

  // Setup keyboard listener for preemption trigger
  setupKeyboardListener(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', async (key) => {
        // Ctrl+C to exit
        if (key[0] === 3) {
          console.log("\n");
          log("INFO", "Shutting down...");
          process.exit(0);
        }
        // 'p' to trigger preemption
        if (key.toString() === 'p' && this.running && !this.paused) {
          await this.simulatePreemption();
        }
      });
    }
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

    // Setup keyboard listener for demo
    this.setupKeyboardListener();

    // Request GPU
    const hasGpu = await this.requestGpu();
    if (!hasGpu) {
      log("ERROR", "Could not get GPU, exiting");
      process.exit(1);
    }

    // Show preemption trigger instructions
    console.log(`${colors.bgYellow}${colors.bold} 💡 DEMO TIP: Press 'p' during training to trigger preemption ${colors.reset}`);
    console.log("");

    // Start training
    await this.train();

    // Release GPU when done (only if not preempted)
    if (!this.paused) {
      await this.release();
    }

    console.log("");
    log("INFO", "Demo complete!");

    // Exit after demo
    process.exit(0);
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
