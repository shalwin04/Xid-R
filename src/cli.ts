/**
 * Xid-R CLI
 *
 * Command-line interface for Xid-R operations.
 */

import { Command } from "commander";
import { createLogger } from "./utils/logger.js";
import { initFirestore } from "./db/firestore.js";
import { getLeaseStats, getLease, getLeasesByStatus } from "./db/leases.js";
import { getCapacitySummary, getAllCapacityUnits } from "./db/capacity.js";
import { generateLeaseExplanation, getRecentAuditEvents } from "./db/audit.js";
import { LeaseStatus } from "./models/lease.js";

const log = createLogger({ module: "cli" });

const program = new Command();

program
  .name("xidr")
  .description("Xid-R - Agentic GPU Compute Broker")
  .version("0.1.0");

// Status command
program
  .command("status")
  .description("Show system status")
  .action(async () => {
    initFirestore();

    const [leaseStats, capacitySummary] = await Promise.all([
      getLeaseStats(),
      getCapacitySummary(),
    ]);

    console.log("\nXid-R System Status");
    console.log("═".repeat(40));
    console.log("\nLeases:");
    console.log(`  Active: ${leaseStats.active}`);
    console.log(`  Pending: ${leaseStats.pending}`);
    console.log(`  Completed: ${leaseStats.completed}`);
    console.log(`  Lost: ${leaseStats.lost}`);
    console.log(`  Total Savings: $${leaseStats.totalSavingsUsd.toFixed(4)}`);

    console.log("\nCapacity:");
    console.log(`  Total Units: ${capacitySummary.total}`);
    console.log(`  Available: ${capacitySummary.available}`);
    console.log(`  Leased: ${capacitySummary.leased}`);
    console.log(`  Harvestable: ${capacitySummary.harvestable}`);

    console.log("\nBy GPU Type:");
    for (const [gpuType, stats] of Object.entries(capacitySummary.byGpuType)) {
      console.log(`  ${gpuType}: ${stats.available}/${stats.total} available`);
    }
    console.log("");
  });

// Leases command
program
  .command("leases")
  .description("List leases")
  .option("-s, --status <status>", "Filter by status")
  .action(async (options) => {
    initFirestore();

    const status = options.status as LeaseStatus | undefined;
    const leases = status
      ? await getLeasesByStatus(status)
      : await getLeasesByStatus(LeaseStatus.ACTIVE);

    console.log(`\n${status || "Active"} Leases`);
    console.log("═".repeat(60));

    if (leases.length === 0) {
      console.log("No leases found.\n");
      return;
    }

    for (const lease of leases) {
      console.log(`\n${lease.id}`);
      console.log(`  Status: ${lease.status}`);
      console.log(`  Agent: ${lease.tenantAgentId}`);
      console.log(`  GPU: ${lease.gpuType}`);
      console.log(`  Capacity: ${lease.capacityUnitId || "pending"}`);
      console.log(`  Lane: ${lease.capacityLane || "pending"}`);
      if (lease.grantedAt) {
        console.log(`  Granted: ${lease.grantedAt.toISOString()}`);
      }
    }
    console.log("");
  });

// Capacity command
program
  .command("capacity")
  .description("List capacity units")
  .action(async () => {
    initFirestore();

    const units = await getAllCapacityUnits();

    console.log("\nCapacity Units");
    console.log("═".repeat(70));

    for (const unit of units) {
      console.log(`\n${unit.id}`);
      console.log(`  Type: ${unit.type} | GPU: ${unit.gpuType}`);
      console.log(`  Status: ${unit.status} | Utilization: ${unit.utilizationPercent.toFixed(1)}%`);
      console.log(`  Trust: ${unit.trustTier} | Isolation: ${unit.isolationMode}`);
      if (unit.currentLeaseId) {
        console.log(`  Current Lease: ${unit.currentLeaseId}`);
      }
    }
    console.log("");
  });

// Explain command
program
  .command("explain <leaseId>")
  .description("Explain decisions for a lease")
  .option("-e, --event <type>", "Specific event type (grant, deny, evict, resume)")
  .action(async (leaseId, options) => {
    initFirestore();

    const lease = await getLease(leaseId);
    if (!lease) {
      console.error(`Lease ${leaseId} not found`);
      process.exit(1);
    }

    const eventTypeMap: Record<string, string> = {
      grant: "lease_granted",
      deny: "lease_denied",
      evict: "reclaim_initiated",
      resume: "resume_completed",
    };

    const explanation = await generateLeaseExplanation(
      leaseId,
      options.event ? eventTypeMap[options.event] : undefined
    );

    console.log(`\nLease Explanation: ${leaseId}`);
    console.log("═".repeat(60));
    console.log(`Status: ${lease.status}`);
    console.log(`\nExplanation:`);
    console.log(explanation.explanation);

    if (explanation.decisionFactors.length > 0) {
      console.log(`\nDecision Factors:`);
      for (const factor of explanation.decisionFactors) {
        console.log(`  • ${factor}`);
      }
    }

    if (explanation.timeline.length > 0) {
      console.log(`\nTimeline:`);
      for (const event of explanation.timeline) {
        console.log(`  [${event.timestamp}] ${event.event}`);
        console.log(`    ${event.details}`);
      }
    }
    console.log("");
  });

// Events command
program
  .command("events")
  .description("Show recent events")
  .option("-n, --limit <number>", "Number of events", "20")
  .action(async (options) => {
    initFirestore();

    const events = await getRecentAuditEvents(parseInt(options.limit, 10));

    console.log("\nRecent Events");
    console.log("═".repeat(70));

    for (const event of events) {
      console.log(`\n[${event.timestamp.toISOString()}] ${event.eventType}`);
      if (event.leaseId) console.log(`  Lease: ${event.leaseId}`);
      if (event.reasoning) console.log(`  ${event.reasoning}`);
    }
    console.log("");
  });

// Parse and run
export function main(): void {
  program.parse();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
