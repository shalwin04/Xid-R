/**
 * Capacity management routes.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  getCapacityUnit,
  getAllCapacityUnits,
  getAvailableCapacity,
  getCapacitySummary,
  upsertCapacityUnit,
  updateUtilization,
  deleteCapacityUnit,
} from "../../db/capacity.js";
import { getConfig } from "../../config.js";

export const capacityRoutes = new Hono();

// Get all capacity units
capacityRoutes.get("/", async (c) => {
  const units = await getAllCapacityUnits();
  return c.json({ capacity_units: units });
});

// Get capacity summary
capacityRoutes.get("/summary", async (c) => {
  const summary = await getCapacitySummary();
  return c.json({ summary });
});

// Get available capacity for a GPU type
capacityRoutes.get("/available/:gpuType", async (c) => {
  const gpuType = c.req.param("gpuType");
  const units = await getAvailableCapacity(gpuType);
  return c.json({
    gpu_type: gpuType,
    available_count: units.length,
    units: units.map((u) => ({
      id: u.id,
      type: u.type,
      utilization_percent: u.utilizationPercent,
      isolation_mode: u.isolationMode,
      preemption_grace_ms: u.preemptionGraceMs,
    })),
  });
});

// Get capacity unit by ID
capacityRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const unit = await getCapacityUnit(id);

  if (!unit) {
    return c.json({ error: "Capacity unit not found" }, 404);
  }

  return c.json({ capacity_unit: unit });
});

// Register/update capacity unit (for capacity fabric)
const RegisterCapacitySchema = z.object({
  type: z.enum(["gke_node_gpu", "spot_vm", "cloud_run_worker"]),
  project_id: z.string(),
  zone: z.string(),
  gpu_type: z.string(),
  memory_gb: z.number(),
  on_demand_hourly_usd: z.number(),
  cluster_name: z.string().optional(),
  node_pool: z.string().optional(),
  instance_name: z.string().optional(),
  gpu_index: z.number().optional(),
  trust_tier: z.enum(["internal", "external", "untrusted"]).optional(),
  isolation_mode: z.enum(["mps", "mig", "dedicated"]).optional(),
});

capacityRoutes.post("/register", zValidator("json", RegisterCapacitySchema), async (c) => {
  const input = c.req.valid("json");

  const unit = await upsertCapacityUnit({
    type: input.type,
    projectId: input.project_id,
    zone: input.zone,
    gpuType: input.gpu_type,
    memoryGb: input.memory_gb,
    onDemandHourlyUsd: input.on_demand_hourly_usd,
    clusterName: input.cluster_name,
    nodePool: input.node_pool,
    instanceName: input.instance_name,
    gpuIndex: input.gpu_index,
    trustTier: input.trust_tier,
    isolationMode: input.isolation_mode,
  });

  return c.json({ capacity_unit: unit }, 201);
});

// Update utilization (for capacity fabric polling)
const UpdateUtilizationSchema = z.object({
  utilization_percent: z.number().min(0).max(100),
});

capacityRoutes.patch(
  "/:id/utilization",
  zValidator("json", UpdateUtilizationSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const config = getConfig();

    const unit = await updateUtilization(
      id,
      input.utilization_percent,
      config.capacity.idleThresholdPercent
    );

    if (!unit) {
      return c.json({ error: "Capacity unit not found" }, 404);
    }

    return c.json({ capacity_unit: unit });
  }
);

// Delete capacity unit (when VM terminates)
capacityRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await deleteCapacityUnit(id);
  return c.json({ deleted: true });
});
