/**
 * Harvesting rules and approvals API routes.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import {
  createRuleSet,
  getRuleSet,
  getDefaultRuleSet,
  listRuleSets,
  updateRuleSet,
  addRule,
  updateRule,
  removeRule,
  deleteRuleSet,
  listPendingApprovals,
  listApprovals,
  getApproval,
  resolveApproval,
  bulkResolveApprovals,
} from "../../db/harvesting-rules.js";

import {
  CreateRuleSetSchema,
  CreateHarvestingRuleSchema,
  ResolveApprovalSchema,
  BulkResolveApprovalsSchema,
  ApprovalStatus,
  evaluateRuleSet,
  RuleEvaluationContext,
} from "../../models/harvesting-rules.js";

import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger({ module: "api:approvals" });

export const approvalsRoutes = new Hono();
export const ruleSetRoutes = new Hono();

// ============================================================================
// Rule Set Routes
// ============================================================================

/**
 * List rule sets for organization.
 */
ruleSetRoutes.get("/", optionalAuthMiddleware(), async (c) => {
  const tenant = c.get("tenant");
  const organizationId = c.req.query("organizationId") || tenant?.id || "default";

  try {
    const ruleSets = await listRuleSets(organizationId);
    return c.json({ ruleSets });
  } catch (error) {
    log.error("Failed to list rule sets", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

/**
 * Get default rule set.
 */
ruleSetRoutes.get("/default", optionalAuthMiddleware(), async (c) => {
  const tenant = c.get("tenant");
  const organizationId = c.req.query("organizationId") || tenant?.id || "default";

  try {
    const ruleSet = await getDefaultRuleSet(organizationId);
    if (!ruleSet) {
      return c.json({ error: "No default rule set found" }, 404);
    }
    return c.json({ ruleSet });
  } catch (error) {
    log.error("Failed to get default rule set", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

/**
 * Get rule set by ID.
 */
ruleSetRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const ruleSet = await getRuleSet(id);
    if (!ruleSet) {
      return c.json({ error: "Rule set not found" }, 404);
    }
    return c.json({ ruleSet });
  } catch (error) {
    log.error("Failed to get rule set", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

/**
 * Create rule set.
 */
ruleSetRoutes.post(
  "/",
  optionalAuthMiddleware(),
  zValidator("json", CreateRuleSetSchema.extend({
    organizationId: z.string().optional(),
  })),
  async (c) => {
    const tenant = c.get("tenant");
    const data = c.req.valid("json");

    try {
      const ruleSet = await createRuleSet({
        organizationId: data.organizationId || tenant?.id || "default",
        name: data.name,
        description: data.description,
        // Rules will get IDs assigned in createRuleSet
        appliedToClusters: data.appliedToClusters,
        isDefault: data.isDefault,
        createdBy: tenant?.email || "system",
      });

      return c.json({ ruleSet }, 201);
    } catch (error) {
      log.error("Failed to create rule set", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

// Schema for updating rule set metadata (rules are managed via separate endpoints)
const UpdateRuleSetSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  appliedToClusters: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

/**
 * Update rule set.
 */
ruleSetRoutes.patch("/:id", zValidator("json", UpdateRuleSetSchema), async (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");

  try {
    await updateRuleSet(id, data);
    const ruleSet = await getRuleSet(id);
    return c.json({ ruleSet });
  } catch (error) {
    log.error("Failed to update rule set", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

/**
 * Delete rule set.
 */
ruleSetRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    await deleteRuleSet(id);
    return c.json({ success: true });
  } catch (error) {
    log.error("Failed to delete rule set", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

/**
 * Add rule to rule set.
 */
ruleSetRoutes.post(
  "/:id/rules",
  optionalAuthMiddleware(),
  zValidator("json", CreateHarvestingRuleSchema),
  async (c) => {
    const ruleSetId = c.req.param("id");
    const tenant = c.get("tenant");
    const data = c.req.valid("json");

    try {
      const rule = await addRule(ruleSetId, {
        ...data,
        createdBy: tenant?.email || "system",
      });
      return c.json({ rule }, 201);
    } catch (error) {
      log.error("Failed to add rule", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Update rule in rule set.
 */
ruleSetRoutes.patch(
  "/:id/rules/:ruleId",
  zValidator("json", CreateHarvestingRuleSchema.partial()),
  async (c) => {
    const ruleSetId = c.req.param("id");
    const ruleId = c.req.param("ruleId");
    const data = c.req.valid("json");

    try {
      await updateRule(ruleSetId, ruleId, data);
      const ruleSet = await getRuleSet(ruleSetId);
      const rule = ruleSet?.rules.find((r) => r.id === ruleId);
      return c.json({ rule });
    } catch (error) {
      log.error("Failed to update rule", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Delete rule from rule set.
 */
ruleSetRoutes.delete("/:id/rules/:ruleId", async (c) => {
  const ruleSetId = c.req.param("id");
  const ruleId = c.req.param("ruleId");

  try {
    await removeRule(ruleSetId, ruleId);
    return c.json({ success: true });
  } catch (error) {
    log.error("Failed to delete rule", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

/**
 * Test rules against a context (dry run).
 */
ruleSetRoutes.post("/:id/test", async (c) => {
  const ruleSetId = c.req.param("id");

  try {
    const ruleSet = await getRuleSet(ruleSetId);
    if (!ruleSet) {
      return c.json({ error: "Rule set not found" }, 404);
    }

    const body = await c.req.json<RuleEvaluationContext>();
    const result = evaluateRuleSet(ruleSet, {
      ...body,
      currentTime: new Date(),
    });

    return c.json({ result });
  } catch (error) {
    log.error("Failed to test rules", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

// ============================================================================
// Approval Routes
// ============================================================================

/**
 * List approvals.
 */
approvalsRoutes.get("/", optionalAuthMiddleware(), async (c) => {
  const tenant = c.get("tenant");
  const organizationId = c.req.query("organizationId") || tenant?.id || "default";
  const status = c.req.query("status") as ApprovalStatus | undefined;
  const limit = parseInt(c.req.query("limit") || "50", 10);

  try {
    const approvals = await listApprovals(organizationId, { status, limit });
    return c.json({ approvals, total: approvals.length });
  } catch (error) {
    log.error("Failed to list approvals", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

/**
 * List pending approvals.
 */
approvalsRoutes.get("/pending", optionalAuthMiddleware(), async (c) => {
  const tenant = c.get("tenant");
  const organizationId = c.req.query("organizationId") || tenant?.id || "default";

  try {
    const approvals = await listPendingApprovals(organizationId);
    return c.json({ approvals, total: approvals.length });
  } catch (error) {
    log.error("Failed to list pending approvals", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

/**
 * Get approval by ID.
 */
approvalsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const approval = await getApproval(id);
    if (!approval) {
      return c.json({ error: "Approval not found" }, 404);
    }
    return c.json({ approval });
  } catch (error) {
    log.error("Failed to get approval", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

/**
 * Resolve an approval (approve or deny).
 */
approvalsRoutes.post(
  "/:id/resolve",
  optionalAuthMiddleware(),
  zValidator("json", ResolveApprovalSchema),
  async (c) => {
    const id = c.req.param("id");
    const tenant = c.get("tenant");
    const data = c.req.valid("json");

    try {
      const approval = await resolveApproval(
        id,
        data.action,
        tenant?.email || "anonymous",
        data.note
      );

      return c.json({ approval });
    } catch (error) {
      log.error("Failed to resolve approval", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Bulk resolve approvals.
 */
approvalsRoutes.post(
  "/bulk-resolve",
  optionalAuthMiddleware(),
  zValidator("json", BulkResolveApprovalsSchema),
  async (c) => {
    const tenant = c.get("tenant");
    const data = c.req.valid("json");

    try {
      const result = await bulkResolveApprovals(
        data.approvalIds,
        data.action,
        tenant?.email || "anonymous",
        data.note
      );

      return c.json(result);
    } catch (error) {
      log.error("Failed to bulk resolve approvals", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);
