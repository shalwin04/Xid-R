#!/usr/bin/env tsx
/**
 * Seed Local Development Environment
 *
 * Creates demo capacity units and agents for local testing.
 * Run this after starting the API server.
 */

const API_URL = process.env.XIDR_API_URL ?? "http://localhost:8080";

interface CapacityUnit {
  type: string;
  project_id: string;
  zone: string;
  gpu_type: string;
  memory_gb: number;
  on_demand_hourly_usd: number;
  instance_name?: string;
  cluster_name?: string;
  node_pool?: string;
}

interface Agent {
  id: string;
  name: string;
  a2a_endpoint: string;
  checkpointable: boolean;
}

const capacityUnits: CapacityUnit[] = [
  // GKE GPU nodes (simulated)
  {
    type: "gke_node_gpu",
    project_id: "demo-project",
    zone: "us-central1-a",
    gpu_type: "nvidia-t4",
    memory_gb: 16,
    on_demand_hourly_usd: 0.35,
    cluster_name: "xidr-demo-cluster",
    node_pool: "gpu-pool",
    instance_name: "gke-node-gpu-001",
  },
  {
    type: "gke_node_gpu",
    project_id: "demo-project",
    zone: "us-central1-a",
    gpu_type: "nvidia-t4",
    memory_gb: 16,
    on_demand_hourly_usd: 0.35,
    cluster_name: "xidr-demo-cluster",
    node_pool: "gpu-pool",
    instance_name: "gke-node-gpu-002",
  },
  {
    type: "gke_node_gpu",
    project_id: "demo-project",
    zone: "us-central1-b",
    gpu_type: "nvidia-l4",
    memory_gb: 24,
    on_demand_hourly_usd: 0.70,
    cluster_name: "xidr-demo-cluster",
    node_pool: "l4-pool",
    instance_name: "gke-node-l4-001",
  },
  // Spot VMs (simulated - these can be "preempted")
  {
    type: "spot_vm",
    project_id: "demo-project",
    zone: "us-central1-a",
    gpu_type: "nvidia-t4",
    memory_gb: 16,
    on_demand_hourly_usd: 0.35,
    instance_name: "spot-gpu-t4-001",
  },
  {
    type: "spot_vm",
    project_id: "demo-project",
    zone: "us-central1-c",
    gpu_type: "nvidia-l4",
    memory_gb: 24,
    on_demand_hourly_usd: 0.70,
    instance_name: "spot-gpu-l4-001",
  },
  // Cloud Run GPU worker (simulated)
  {
    type: "cloud_run_worker",
    project_id: "demo-project",
    zone: "us-central1",
    gpu_type: "nvidia-l4",
    memory_gb: 24,
    on_demand_hourly_usd: 0.58,
    instance_name: "cloudrun-gpu-worker-001",
  },
];

const agents: Agent[] = [
  {
    id: "research-agent-1",
    name: "Research Agent",
    a2a_endpoint: "http://localhost:8091",
    checkpointable: true,
  },
  {
    id: "compute-agent-1",
    name: "Compute Agent",
    a2a_endpoint: "http://localhost:8092",
    checkpointable: true,
  },
  {
    id: "demo-agent-1",
    name: "Demo Agent",
    a2a_endpoint: "http://localhost:8090",
    checkpointable: true,
  },
];

async function request(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  return response.json();
}

async function seed(): Promise<void> {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          Xid-R Local Development Setup                         ║
╚═══════════════════════════════════════════════════════════════╝

API URL: ${API_URL}
`);

  // Check health
  console.log("Checking API health...");
  try {
    const health = await request("/health") as { status: string };
    if (health.status !== "ok") {
      throw new Error("API not healthy");
    }
    console.log("✅ API is healthy\n");
  } catch (error) {
    console.error("❌ API is not running. Start it with: npm run dev");
    process.exit(1);
  }

  // Seed capacity units
  console.log("Seeding capacity units...");
  for (const unit of capacityUnits) {
    try {
      const result = await request("/api/capacity/register", {
        method: "POST",
        body: JSON.stringify(unit),
      }) as { capacity_unit?: { id: string } };
      console.log(`  ✅ ${unit.instance_name} (${unit.gpu_type})`);
    } catch (error) {
      console.log(`  ⚠️  ${unit.instance_name}: ${(error as Error).message}`);
    }
  }

  // Seed agents
  console.log("\nRegistering agents...");
  for (const agent of agents) {
    try {
      await request("/api/agents/register", {
        method: "POST",
        body: JSON.stringify(agent),
      });
      console.log(`  ✅ ${agent.name} (${agent.id})`);
    } catch (error) {
      console.log(`  ⚠️  ${agent.name}: ${(error as Error).message}`);
    }
  }

  // Show summary
  console.log("\n" + "═".repeat(60));
  console.log("Setup Complete!");
  console.log("═".repeat(60));

  const capacitySummary = await request("/api/capacity/summary") as {
    summary: {
      total: number;
      available: number;
      byGpuType: Record<string, { total: number; available: number }>;
    };
  };

  console.log("\nCapacity Summary:");
  console.log(`  Total: ${capacitySummary.summary.total}`);
  console.log(`  Available: ${capacitySummary.summary.available}`);
  console.log("  By GPU Type:");
  for (const [gpuType, counts] of Object.entries(capacitySummary.summary.byGpuType)) {
    console.log(`    ${gpuType}: ${counts.available}/${counts.total} available`);
  }

  console.log("\nNext Steps:");
  console.log("  1. Start the demo agent:");
  console.log("     npm run start:demo-agent");
  console.log("");
  console.log("  2. Open the web dashboard:");
  console.log("     npm run web");
  console.log("     Open http://localhost:3000");
  console.log("");
  console.log("  3. Run integration tests:");
  console.log("     npm run test:integration");
  console.log("");
  console.log("  4. Run the full demo:");
  console.log("     npm run demo");
  console.log("");
}

// Run
seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
