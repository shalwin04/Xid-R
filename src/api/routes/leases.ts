/**
 * Lease management routes.
 */

import { Hono } from "hono";
import {
  getLease,
  getLeasesByStatus,
  getPendingLeases,
  getLeasesForAgent,
  getLeaseStats,
} from "../../db/leases.js";
import { LeaseStatus } from "../../models/lease.js";

export const leaseRoutes = new Hono();

// Get all leases (with optional status filter)
leaseRoutes.get("/", async (c) => {
  const status = c.req.query("status") as LeaseStatus | undefined;

  if (status) {
    const leases = await getLeasesByStatus(status);
    return c.json({ leases });
  }

  // Return pending + active by default
  const [pending, active] = await Promise.all([
    getLeasesByStatus(LeaseStatus.PENDING),
    getLeasesByStatus(LeaseStatus.ACTIVE),
  ]);

  return c.json({
    leases: [...pending, ...active],
    counts: {
      pending: pending.length,
      active: active.length,
    },
  });
});

// Get lease by ID
leaseRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const lease = await getLease(id);

  if (!lease) {
    return c.json({ error: "Lease not found" }, 404);
  }

  return c.json({ lease });
});

// Get leases for an agent
leaseRoutes.get("/agent/:agentId", async (c) => {
  const agentId = c.req.param("agentId");
  const leases = await getLeasesForAgent(agentId);
  return c.json({ leases });
});

// Get pending lease queue
leaseRoutes.get("/queue/pending", async (c) => {
  const leases = await getPendingLeases();
  return c.json({
    queue: leases.map((lease, index) => ({
      position: index + 1,
      lease_id: lease.id,
      agent_id: lease.tenantAgentId,
      gpu_type: lease.gpuType,
      priority: lease.priority,
      requested_at: lease.requestedAt.toISOString(),
    })),
  });
});

// Get lease statistics
leaseRoutes.get("/stats/summary", async (c) => {
  const stats = await getLeaseStats();
  return c.json({ stats });
});
