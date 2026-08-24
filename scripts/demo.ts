/**
 * Xid-R Demo Script
 *
 * Demonstrates the full Xid-R flow:
 * 1. Start all services
 * 2. Tenant agents request GPUs
 * 3. Simulate Spot preemption
 * 4. Show A2A negotiation and checkpoint
 * 5. Show xidr_explain
 */

import { createLogger } from "../src/utils/logger.js";
import { initFirestore } from "../src/db/firestore.js";
import { getCapacityFabric } from "../src/capacity/fabric.js";
import { SchedulerAgent } from "../src/agents/scheduler.js";
import { getNegotiator } from "../src/agents/negotiator.js";
import { getPreemptionHandler } from "../src/capacity/preemption.js";
import { createApp, startServer } from "../src/api/server.js";
import { DashboardServer } from "../src/dashboard/server.js";
import { getAllCapacityUnits } from "../src/db/capacity.js";
import { getLeasesByStatus } from "../src/db/leases.js";
import { LeaseStatus } from "../src/models/lease.js";

const log = createLogger({ module: "demo" });

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDemo(): Promise<void> {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██╗  ██╗██╗██████╗       ██████╗                           ║
║   ╚██╗██╔╝██║██╔══██╗      ██╔══██╗                          ║
║    ╚███╔╝ ██║██║  ██║█████╗██████╔╝                          ║
║    ██╔██╗ ██║██║  ██║╚════╝██╔══██╗                          ║
║   ██╔╝ ██╗██║██████╔╝      ██║  ██║                          ║
║   ╚═╝  ╚═╝╚═╝╚═════╝       ╚═╝  ╚═╝                          ║
║                                                               ║
║   Agentic GPU Compute Broker                                  ║
║   "Every idle cycle, checkpointed"                           ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

  log.info("=== Starting Xid-R Demo ===");

  // Initialize services
  log.info("Step 1: Initializing services...");

  initFirestore();

  // Start capacity fabric
  const capacityFabric = getCapacityFabric();
  capacityFabric.start();
  await sleep(2000);

  // Start scheduler
  const scheduler = new SchedulerAgent();
  scheduler.start(3000);

  // Start negotiator
  const negotiator = getNegotiator();

  // Start preemption handler (simulated mode)
  const preemptionHandler = getPreemptionHandler();

  log.info("Services started");
  await sleep(1000);

  // Show initial capacity
  log.info("Step 2: Discovering capacity...");
  const units = await getAllCapacityUnits();
  console.log("\nDiscovered Capacity:");
  console.log("─".repeat(60));
  for (const unit of units) {
    console.log(`  ${unit.id}`);
    console.log(`    GPU: ${unit.gpuType} | Type: ${unit.type}`);
    console.log(`    Status: ${unit.status} | Utilization: ${unit.utilizationPercent.toFixed(1)}%`);
  }
  console.log("");

  await sleep(2000);

  // Simulate GPU requests
  log.info("Step 3: Agents requesting GPU capacity...");

  // Request 1: Research Agent
  const res1 = await fetch("http://localhost:8080/mcp/tools/xidr_request_gpu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gpu_type: "nvidia-t4",
      duration_hint_seconds: 3600,
      priority: "normal",
      a2a_endpoint: "http://localhost:9001",
      checkpointable: true,
      agent_id: "demo_research_agent",
      agent_name: "Demo Research Agent",
    }),
  });
  const result1 = await res1.json();
  console.log("\nResearch Agent Request:");
  console.log(`  Lease ID: ${result1.lease_id}`);
  console.log(`  Status: ${result1.status}`);
  if (result1.capacity_unit_id) {
    console.log(`  Capacity: ${result1.capacity_unit_id}`);
  }

  await sleep(1000);

  // Request 2: Compute Agent
  const res2 = await fetch("http://localhost:8080/mcp/tools/xidr_request_gpu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gpu_type: "nvidia-l4",
      duration_hint_seconds: 7200,
      priority: "high",
      a2a_endpoint: "http://localhost:9002",
      checkpointable: true,
      agent_id: "demo_compute_agent",
      agent_name: "Demo Compute Agent",
    }),
  });
  const result2 = await res2.json();
  console.log("\nCompute Agent Request:");
  console.log(`  Lease ID: ${result2.lease_id}`);
  console.log(`  Status: ${result2.status}`);
  if (result2.capacity_unit_id) {
    console.log(`  Capacity: ${result2.capacity_unit_id}`);
  }

  await sleep(2000);

  // Show active leases
  log.info("Step 4: Checking system status...");
  const statusRes = await fetch("http://localhost:8080/mcp/tools/xidr_status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const status = await statusRes.json();
  console.log("\nSystem Status:");
  console.log(`  Active Leases: ${status.system.active_leases}`);
  console.log(`  Pending Requests: ${status.system.pending_requests}`);
  console.log(`  Total Savings: $${status.system.total_savings_usd.toFixed(4)}`);
  console.log(`  Available Capacity:`, status.system.available_capacity);

  await sleep(3000);

  // Simulate preemption
  log.info("Step 5: Simulating Spot preemption...");
  console.log("\n⚠️  PREEMPTION NOTICE RECEIVED");
  console.log("   Source: Spot VM xidr-spot-gpu-1");
  console.log("   Grace Period: 120 seconds");

  // Find a leased capacity unit to preempt
  const leasedUnits = units.filter((u) => u.currentLeaseId);
  if (leasedUnits.length > 0) {
    const targetUnit = leasedUnits[0];
    console.log(`   Target: ${targetUnit.id}`);

    // Trigger preemption simulation
    await preemptionHandler.simulatePreemption(targetUnit.id);
  }

  await sleep(5000);

  // Show xidr_explain
  log.info("Step 6: Explaining decisions with xidr_explain...");
  const activeLeases = await getLeasesByStatus(LeaseStatus.ACTIVE);
  if (activeLeases.length > 0) {
    const explainRes = await fetch("http://localhost:8080/mcp/tools/xidr_explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lease_id: activeLeases[0].id,
      }),
    });
    const explanation = await explainRes.json();

    console.log("\nxidr_explain output:");
    console.log("─".repeat(60));
    console.log(`Lease: ${explanation.lease_id}`);
    console.log(`Status: ${explanation.lease_status}`);
    console.log(`\nExplanation: ${explanation.explanation}`);
    console.log(`\nDecision Factors: ${explanation.decision_factors.join(", ")}`);
    console.log("\nTimeline:");
    for (const event of explanation.timeline.slice(0, 5)) {
      console.log(`  [${event.timestamp}] ${event.event}`);
      console.log(`    ${event.details}`);
    }
  }

  console.log("\n" + "═".repeat(60));
  console.log("Demo Complete!");
  console.log("");
  console.log("Dashboard: http://localhost:8081");
  console.log("API: http://localhost:8080");
  console.log("MCP Tools: http://localhost:8080/mcp/tools");
  console.log("═".repeat(60) + "\n");

  // Keep running
  log.info("Demo services running. Press Ctrl+C to exit.");
}

// Run demo
runDemo().catch((err) => {
  log.error("Demo failed", { error: err.message });
  process.exit(1);
});
