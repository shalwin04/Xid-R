/**
 * Harvesting Rules Engine Service
 *
 * Integrates rule evaluation with capacity management to determine
 * whether GPU capacity can be harvested for tenant workloads.
 */

import { createLogger } from "../utils/logger.js";
import {
  HarvestingRuleSet,
  HarvestingRule,
  RuleAction,
  ApprovalStatus,
  RuleEvaluationContext,
  RuleEvaluationResult,
  evaluateRuleSet,
  evaluateConditions,
} from "../models/harvesting-rules.js";
import {
  getDefaultRuleSet,
  listRuleSets,
  createApproval,
  listPendingApprovals,
  processAutoApprovals,
  expireOldApprovals,
} from "../db/harvesting-rules.js";
import { CapacityUnit } from "../models/capacity.js";
import { Tenant } from "../models/tenant.js";

const log = createLogger({ module: "rules-engine" });

// ============================================================================
// Types
// ============================================================================

export interface HarvestingDecision {
  canHarvest: boolean;
  action: RuleAction;
  reason: string;
  matchedRule?: HarvestingRule;
  approvalId?: string;
  matchedConditions: string[];
  failedConditions: string[];
}

export interface CapacityContext {
  capacityUnit: CapacityUnit;
  utilizationPercent: number;
  idleMinutes: number;
  labels: Record<string, string>;
}

export interface TenantContext {
  tenant?: Tenant;
  agentId?: string;
  agentName?: string;
}

// ============================================================================
// GPU Pricing
// ============================================================================

const GPU_HOURLY_PRICES: Record<string, number> = {
  "nvidia-t4": 0.35,
  "nvidia-l4": 0.67,
  "nvidia-a100-40gb": 3.67,
  "nvidia-a100-80gb": 5.12,
  "nvidia-h100": 10.80,
  "nvidia-v100": 2.48,
  "nvidia-p100": 1.46,
  "nvidia-k80": 0.45,
};

export function getGpuHourlyPrice(gpuType: string): number {
  // Normalize GPU type
  const normalized = gpuType.toLowerCase().replace(/_/g, "-");

  // Try exact match
  if (GPU_HOURLY_PRICES[normalized]) {
    return GPU_HOURLY_PRICES[normalized];
  }

  // Try partial match
  for (const [key, price] of Object.entries(GPU_HOURLY_PRICES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return price;
    }
  }

  // Default to T4 price
  log.warn("Unknown GPU type, using default price", { gpuType });
  return GPU_HOURLY_PRICES["nvidia-t4"];
}

// ============================================================================
// Rules Engine
// ============================================================================

/**
 * Main entry point: Evaluate whether GPU capacity can be harvested.
 */
export async function evaluateHarvesting(
  organizationId: string,
  capacityContext: CapacityContext,
  tenantContext: TenantContext = {}
): Promise<HarvestingDecision> {
  const { capacityUnit, utilizationPercent, idleMinutes, labels } = capacityContext;
  const { tenant, agentId, agentName } = tenantContext;

  log.debug("Evaluating harvesting decision", {
    organizationId,
    capacityUnitId: capacityUnit.id,
    gpuType: capacityUnit.gpuType,
    utilizationPercent,
    idleMinutes,
  });

  // Get applicable rule set
  const ruleSet = await getApplicableRuleSet(organizationId, capacityUnit.clusterName || undefined);

  if (!ruleSet) {
    log.warn("No rule set found, defaulting to require approval", { organizationId });
    return {
      canHarvest: false,
      action: RuleAction.REQUIRE_APPROVAL,
      reason: "No harvesting rules configured. Manual approval required.",
      matchedConditions: [],
      failedConditions: ["No rule set found"],
    };
  }

  // Build evaluation context
  const evalContext: RuleEvaluationContext = {
    gpuType: capacityUnit.gpuType,
    gpuValuePerHourUsd: getGpuHourlyPrice(capacityUnit.gpuType),
    nodePool: capacityUnit.nodePool || "",
    nodeName: capacityUnit.instanceName || "",
    namespace: undefined, // Not applicable at capacity level
    labels,
    utilizationPercent,
    idleMinutes,
    tenantTier: tenant?.tier,
    tenantId: tenant?.id,
    currentTime: new Date(),
  };

  // Evaluate rules
  const result = evaluateRuleSet(ruleSet, evalContext);

  log.info("Rule evaluation complete", {
    capacityUnitId: capacityUnit.id,
    matched: result.matched,
    action: result.action,
    matchedRule: result.matchedRule?.name,
  });

  // Process based on action
  switch (result.action) {
    case RuleAction.AUTO_APPROVE:
      return {
        canHarvest: true,
        action: RuleAction.AUTO_APPROVE,
        reason: result.explanation,
        matchedRule: result.matchedRule,
        matchedConditions: result.matchedConditions,
        failedConditions: result.failedConditions,
      };

    case RuleAction.DENY:
      return {
        canHarvest: false,
        action: RuleAction.DENY,
        reason: result.explanation,
        matchedRule: result.matchedRule,
        matchedConditions: result.matchedConditions,
        failedConditions: result.failedConditions,
      };

    case RuleAction.REQUIRE_APPROVAL:
      // Check for existing pending approval
      const existingApprovals = await listPendingApprovals(organizationId);
      const existingApproval = existingApprovals.find(
        (a) => a.capacityUnitId === capacityUnit.id
      );

      if (existingApproval) {
        return {
          canHarvest: false,
          action: RuleAction.REQUIRE_APPROVAL,
          reason: "Approval already pending",
          matchedRule: result.matchedRule,
          approvalId: existingApproval.id,
          matchedConditions: result.matchedConditions,
          failedConditions: result.failedConditions,
        };
      }

      // Create approval request
      const approval = await createApproval({
        organizationId,
        clusterId: capacityUnit.clusterName || "",
        capacityUnitId: capacityUnit.id,
        gpuType: capacityUnit.gpuType,
        nodeName: capacityUnit.instanceName || "",
        nodePool: capacityUnit.nodePool || "",
        gpuIndex: capacityUnit.gpuIndex,
        idleMinutes,
        utilizationPercent,
        estimatedValuePerHourUsd: getGpuHourlyPrice(capacityUnit.gpuType),
        requestingTenantId: tenant?.id,
        requestingAgentId: agentId,
        requestingAgentName: agentName,
        triggeredRuleSetId: ruleSet.id,
        triggeredRuleId: result.matchedRule?.id || "default",
        triggeredRuleName: result.matchedRule?.name || "Default Rule",
        expiresInMinutes: result.matchedRule?.approvalConfig?.autoApproveAfterMinutes || 60,
      });

      log.info("Created approval request", {
        approvalId: approval.id,
        capacityUnitId: capacityUnit.id,
        gpuType: capacityUnit.gpuType,
      });

      return {
        canHarvest: false,
        action: RuleAction.REQUIRE_APPROVAL,
        reason: `Approval required: ${result.explanation}`,
        matchedRule: result.matchedRule,
        approvalId: approval.id,
        matchedConditions: result.matchedConditions,
        failedConditions: result.failedConditions,
      };

    default:
      return {
        canHarvest: false,
        action: RuleAction.DENY,
        reason: "Unknown action",
        matchedConditions: [],
        failedConditions: ["Unknown action"],
      };
  }
}

/**
 * Get the applicable rule set for a cluster.
 */
async function getApplicableRuleSet(
  organizationId: string,
  clusterId?: string
): Promise<HarvestingRuleSet | null> {
  // First, try to find a rule set specifically applied to this cluster
  if (clusterId) {
    const ruleSets = await listRuleSets(organizationId);
    const specificRuleSet = ruleSets.find(
      (rs) =>
        rs.appliedToClusters.includes(clusterId) &&
        !rs.appliedToClusters.includes("*")
    );
    if (specificRuleSet) {
      return specificRuleSet;
    }
  }

  // Fall back to default rule set
  return getDefaultRuleSet(organizationId);
}

/**
 * Check if an approval has been granted for a capacity unit.
 */
export async function checkApprovalStatus(
  approvalId: string
): Promise<{ approved: boolean; status: ApprovalStatus }> {
  const { getApproval } = await import("../db/harvesting-rules.js");
  const approval = await getApproval(approvalId);

  if (!approval) {
    return { approved: false, status: ApprovalStatus.DENIED };
  }

  const approved =
    approval.status === ApprovalStatus.APPROVED ||
    approval.status === ApprovalStatus.AUTO_APPROVED;

  return { approved, status: approval.status };
}

/**
 * Dry-run evaluation for testing rules.
 */
export async function testRuleEvaluation(
  organizationId: string,
  context: RuleEvaluationContext
): Promise<RuleEvaluationResult> {
  const ruleSet = await getDefaultRuleSet(organizationId);

  if (!ruleSet) {
    return {
      matched: false,
      action: RuleAction.REQUIRE_APPROVAL,
      explanation: "No rule set found",
      matchedConditions: [],
      failedConditions: ["No rule set configured"],
    };
  }

  return evaluateRuleSet(ruleSet, context);
}

/**
 * Process pending approvals (auto-approve and expire).
 * Should be called periodically by a background worker.
 */
export async function processApprovals(): Promise<{
  autoApproved: number;
  expired: number;
}> {
  const autoApproved = await processAutoApprovals();
  const expired = await expireOldApprovals();

  if (autoApproved > 0 || expired > 0) {
    log.info("Processed approvals", { autoApproved, expired });
  }

  return { autoApproved, expired };
}

/**
 * Get harvesting statistics for an organization.
 */
export async function getHarvestingStats(organizationId: string): Promise<{
  pendingApprovals: number;
  autoApprovedToday: number;
  deniedToday: number;
  activeRuleSets: number;
}> {
  const { listApprovals } = await import("../db/harvesting-rules.js");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [pendingApprovals, allApprovals, ruleSets] = await Promise.all([
    listPendingApprovals(organizationId),
    listApprovals(organizationId, { limit: 1000 }),
    listRuleSets(organizationId),
  ]);

  const todayApprovals = allApprovals.filter(
    (a) => a.createdAt >= today
  );

  const autoApprovedToday = todayApprovals.filter(
    (a) => a.status === ApprovalStatus.AUTO_APPROVED
  ).length;

  const deniedToday = todayApprovals.filter(
    (a) => a.status === ApprovalStatus.DENIED
  ).length;

  return {
    pendingApprovals: pendingApprovals.length,
    autoApprovedToday,
    deniedToday,
    activeRuleSets: ruleSets.length,
  };
}

// ============================================================================
// Background Worker
// ============================================================================

let workerInterval: NodeJS.Timeout | null = null;

/**
 * Start the background worker that processes approvals.
 */
export function startApprovalWorker(intervalMs: number = 60000): void {
  if (workerInterval) {
    log.warn("Approval worker already running");
    return;
  }

  log.info("Starting approval worker", { intervalMs });

  workerInterval = setInterval(async () => {
    try {
      await processApprovals();
    } catch (error) {
      log.error("Approval worker error", { error: (error as Error).message });
    }
  }, intervalMs);
}

/**
 * Stop the background worker.
 */
export function stopApprovalWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    log.info("Stopped approval worker");
  }
}
