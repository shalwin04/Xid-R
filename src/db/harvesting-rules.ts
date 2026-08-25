/**
 * Harvesting rules and approval workflow database operations.
 */

import { getFirestore } from "./firestore.js";
import { createLogger } from "../utils/logger.js";
import { generateId } from "../utils/ids.js";
import {
  HarvestingRuleSet,
  HarvestingRule,
  HarvestingApproval,
  ApprovalStatus,
  RuleAction,
  createDefaultRules,
} from "../models/harvesting-rules.js";

const log = createLogger({ module: "db:harvesting-rules" });

const RULE_SETS_COLLECTION = "harvesting_rule_sets";
const APPROVALS_COLLECTION = "harvesting_approvals";

// ============================================================================
// Rule Set Operations
// ============================================================================

/**
 * Create a new rule set.
 */
export async function createRuleSet(data: {
  organizationId: string;
  name: string;
  description?: string;
  rules?: HarvestingRule[];
  appliedToClusters?: string[];
  isDefault?: boolean;
  createdBy: string;
}): Promise<HarvestingRuleSet> {
  const db = getFirestore();
  const id = generateId("ruleset");

  // Generate IDs for rules if not present
  const rules = (data.rules || createDefaultRules()).map((rule, index) => ({
    ...rule,
    id: rule.id || generateId("rule"),
    priority: rule.priority ?? (index + 1) * 10,
    createdAt: rule.createdAt || new Date(),
    updatedAt: rule.updatedAt || new Date(),
    createdBy: rule.createdBy || data.createdBy,
  }));

  const ruleSet: HarvestingRuleSet = {
    id,
    organizationId: data.organizationId,
    name: data.name,
    description: data.description || "",
    rules,
    appliedToClusters: data.appliedToClusters || ["*"],
    isDefault: data.isDefault ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: data.createdBy,
  };

  // If this is set as default, unset other defaults
  if (ruleSet.isDefault) {
    await unsetDefaultRuleSet(data.organizationId);
  }

  await db.collection(RULE_SETS_COLLECTION).doc(id).set({
    ...ruleSet,
    createdAt: ruleSet.createdAt,
    updatedAt: ruleSet.updatedAt,
    rules: ruleSet.rules.map((r) => ({
      ...r,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  });

  log.info("Created rule set", { id, organizationId: data.organizationId, name: data.name });
  return ruleSet;
}

/**
 * Get rule set by ID.
 */
export async function getRuleSet(id: string): Promise<HarvestingRuleSet | null> {
  const db = getFirestore();
  const doc = await db.collection(RULE_SETS_COLLECTION).doc(id).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    rules: (data.rules || []).map((r: HarvestingRule) => ({
      ...r,
      createdAt: (r.createdAt as unknown as { toDate: () => Date })?.toDate?.() || new Date(),
      updatedAt: (r.updatedAt as unknown as { toDate: () => Date })?.toDate?.() || new Date(),
    })),
  } as HarvestingRuleSet;
}

/**
 * Get default rule set for an organization.
 */
export async function getDefaultRuleSet(organizationId: string): Promise<HarvestingRuleSet | null> {
  const db = getFirestore();
  const snapshot = await db
    .collection(RULE_SETS_COLLECTION)
    .where("organizationId", "==", organizationId)
    .where("isDefault", "==", true)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    rules: (data.rules || []).map((r: HarvestingRule) => ({
      ...r,
      createdAt: (r.createdAt as unknown as { toDate: () => Date })?.toDate?.() || new Date(),
      updatedAt: (r.updatedAt as unknown as { toDate: () => Date })?.toDate?.() || new Date(),
    })),
  } as HarvestingRuleSet;
}

/**
 * List rule sets for an organization.
 */
export async function listRuleSets(organizationId: string): Promise<HarvestingRuleSet[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(RULE_SETS_COLLECTION)
    .where("organizationId", "==", organizationId)
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      rules: (data.rules || []).map((r: HarvestingRule) => ({
        ...r,
        createdAt: (r.createdAt as unknown as { toDate: () => Date })?.toDate?.() || new Date(),
        updatedAt: (r.updatedAt as unknown as { toDate: () => Date })?.toDate?.() || new Date(),
      })),
    } as HarvestingRuleSet;
  });
}

/**
 * Unset default rule set for organization.
 */
async function unsetDefaultRuleSet(organizationId: string): Promise<void> {
  const db = getFirestore();
  const snapshot = await db
    .collection(RULE_SETS_COLLECTION)
    .where("organizationId", "==", organizationId)
    .where("isDefault", "==", true)
    .get();

  const batch = db.batch();
  for (const doc of snapshot.docs) {
    batch.update(doc.ref, { isDefault: false, updatedAt: new Date() });
  }
  await batch.commit();
}

/**
 * Update rule set.
 */
export async function updateRuleSet(
  id: string,
  updates: Partial<Omit<HarvestingRuleSet, "id" | "organizationId" | "createdAt" | "createdBy">>
): Promise<void> {
  const db = getFirestore();

  // If setting as default, unset other defaults
  if (updates.isDefault) {
    const ruleSet = await getRuleSet(id);
    if (ruleSet) {
      await unsetDefaultRuleSet(ruleSet.organizationId);
    }
  }

  await db.collection(RULE_SETS_COLLECTION).doc(id).update({
    ...updates,
    updatedAt: new Date(),
  });

  log.debug("Updated rule set", { id });
}

/**
 * Add a rule to a rule set.
 */
export async function addRule(ruleSetId: string, rule: Omit<HarvestingRule, "id" | "createdAt" | "updatedAt">): Promise<HarvestingRule> {
  const ruleSet = await getRuleSet(ruleSetId);
  if (!ruleSet) {
    throw new Error("Rule set not found");
  }

  const newRule: HarvestingRule = {
    ...rule,
    id: generateId("rule"),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const updatedRules = [...ruleSet.rules, newRule];

  await updateRuleSet(ruleSetId, { rules: updatedRules });

  log.info("Added rule to set", { ruleSetId, ruleId: newRule.id, name: newRule.name });
  return newRule;
}

/**
 * Update a rule within a rule set.
 */
export async function updateRule(
  ruleSetId: string,
  ruleId: string,
  updates: Partial<Omit<HarvestingRule, "id" | "createdAt" | "createdBy">>
): Promise<void> {
  const ruleSet = await getRuleSet(ruleSetId);
  if (!ruleSet) {
    throw new Error("Rule set not found");
  }

  const updatedRules = ruleSet.rules.map((rule) =>
    rule.id === ruleId
      ? { ...rule, ...updates, updatedAt: new Date() }
      : rule
  );

  await updateRuleSet(ruleSetId, { rules: updatedRules });

  log.debug("Updated rule", { ruleSetId, ruleId });
}

/**
 * Remove a rule from a rule set.
 */
export async function removeRule(ruleSetId: string, ruleId: string): Promise<void> {
  const ruleSet = await getRuleSet(ruleSetId);
  if (!ruleSet) {
    throw new Error("Rule set not found");
  }

  const updatedRules = ruleSet.rules.filter((rule) => rule.id !== ruleId);

  await updateRuleSet(ruleSetId, { rules: updatedRules });

  log.info("Removed rule from set", { ruleSetId, ruleId });
}

/**
 * Delete rule set.
 */
export async function deleteRuleSet(id: string): Promise<void> {
  const db = getFirestore();
  await db.collection(RULE_SETS_COLLECTION).doc(id).delete();
  log.info("Deleted rule set", { id });
}

// ============================================================================
// Approval Operations
// ============================================================================

/**
 * Create a harvesting approval request.
 */
export async function createApproval(data: {
  organizationId: string;
  clusterId: string;
  capacityUnitId: string;
  gpuType: string;
  nodeName: string;
  nodePool: string;
  gpuIndex: number;
  idleMinutes: number;
  utilizationPercent: number;
  estimatedValuePerHourUsd: number;
  requestingTenantId?: string;
  requestingAgentId?: string;
  requestingAgentName?: string;
  triggeredRuleSetId: string;
  triggeredRuleId: string;
  triggeredRuleName: string;
  expiresInMinutes?: number;
}): Promise<HarvestingApproval> {
  const db = getFirestore();
  const id = generateId("approval");

  const expiresInMs = (data.expiresInMinutes || 60) * 60 * 1000;

  const approval: HarvestingApproval = {
    id,
    organizationId: data.organizationId,
    clusterId: data.clusterId,
    capacityUnitId: data.capacityUnitId,
    gpuType: data.gpuType,
    nodeName: data.nodeName,
    nodePool: data.nodePool,
    gpuIndex: data.gpuIndex,
    idleMinutes: data.idleMinutes,
    utilizationPercent: data.utilizationPercent,
    estimatedValuePerHourUsd: data.estimatedValuePerHourUsd,
    requestingTenantId: data.requestingTenantId,
    requestingAgentId: data.requestingAgentId,
    requestingAgentName: data.requestingAgentName,
    triggeredRuleSetId: data.triggeredRuleSetId,
    triggeredRuleId: data.triggeredRuleId,
    triggeredRuleName: data.triggeredRuleName,
    status: ApprovalStatus.PENDING,
    notificationsSent: [],
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + expiresInMs),
    approvals: [],
  };

  await db.collection(APPROVALS_COLLECTION).doc(id).set({
    ...approval,
    createdAt: approval.createdAt,
    expiresAt: approval.expiresAt,
  });

  log.info("Created approval request", { id, capacityUnitId: data.capacityUnitId, gpuType: data.gpuType });
  return approval;
}

/**
 * Get approval by ID.
 */
export async function getApproval(id: string): Promise<HarvestingApproval | null> {
  const db = getFirestore();
  const doc = await db.collection(APPROVALS_COLLECTION).doc(id).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toDate() || new Date(),
    expiresAt: data.expiresAt?.toDate() || new Date(),
    resolution: data.resolution
      ? {
          ...data.resolution,
          resolvedAt: data.resolution.resolvedAt?.toDate() || new Date(),
        }
      : undefined,
    notificationsSent: (data.notificationsSent || []).map((n: { sentAt: { toDate: () => Date } }) => ({
      ...n,
      sentAt: n.sentAt?.toDate() || new Date(),
    })),
    approvals: (data.approvals || []).map((a: { approvedAt: { toDate: () => Date } }) => ({
      ...a,
      approvedAt: a.approvedAt?.toDate() || new Date(),
    })),
  } as HarvestingApproval;
}

/**
 * List pending approvals for an organization.
 */
export async function listPendingApprovals(organizationId: string): Promise<HarvestingApproval[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(APPROVALS_COLLECTION)
    .where("organizationId", "==", organizationId)
    .where("status", "==", ApprovalStatus.PENDING)
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      expiresAt: data.expiresAt?.toDate() || new Date(),
      notificationsSent: (data.notificationsSent || []).map((n: { sentAt: { toDate: () => Date } }) => ({
        ...n,
        sentAt: n.sentAt?.toDate() || new Date(),
      })),
      approvals: (data.approvals || []).map((a: { approvedAt: { toDate: () => Date } }) => ({
        ...a,
        approvedAt: a.approvedAt?.toDate() || new Date(),
      })),
    } as HarvestingApproval;
  });
}

/**
 * List all approvals for an organization with optional status filter.
 */
export async function listApprovals(
  organizationId: string,
  options?: { status?: ApprovalStatus; limit?: number }
): Promise<HarvestingApproval[]> {
  const db = getFirestore();
  let query = db
    .collection(APPROVALS_COLLECTION)
    .where("organizationId", "==", organizationId)
    .orderBy("createdAt", "desc");

  if (options?.status) {
    query = query.where("status", "==", options.status);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      expiresAt: data.expiresAt?.toDate() || new Date(),
      resolution: data.resolution
        ? {
            ...data.resolution,
            resolvedAt: data.resolution.resolvedAt?.toDate() || new Date(),
          }
        : undefined,
      notificationsSent: (data.notificationsSent || []).map((n: { sentAt: { toDate: () => Date } }) => ({
        ...n,
        sentAt: n.sentAt?.toDate() || new Date(),
      })),
      approvals: (data.approvals || []).map((a: { approvedAt: { toDate: () => Date } }) => ({
        ...a,
        approvedAt: a.approvedAt?.toDate() || new Date(),
      })),
    } as HarvestingApproval;
  });
}

/**
 * Resolve an approval (approve or deny).
 */
export async function resolveApproval(
  id: string,
  action: "approve" | "deny",
  resolvedBy: string,
  note?: string
): Promise<HarvestingApproval> {
  const db = getFirestore();
  const approval = await getApproval(id);

  if (!approval) {
    throw new Error("Approval not found");
  }

  if (approval.status !== ApprovalStatus.PENDING) {
    throw new Error(`Approval already resolved with status: ${approval.status}`);
  }

  const status = action === "approve" ? ApprovalStatus.APPROVED : ApprovalStatus.DENIED;

  await db.collection(APPROVALS_COLLECTION).doc(id).update({
    status,
    resolution: {
      resolvedAt: new Date(),
      resolvedBy,
      action,
      note,
    },
  });

  log.info("Resolved approval", { id, action, resolvedBy });

  return (await getApproval(id))!;
}

/**
 * Bulk resolve approvals.
 */
export async function bulkResolveApprovals(
  ids: string[],
  action: "approve" | "deny",
  resolvedBy: string,
  note?: string
): Promise<{ resolved: number; failed: number }> {
  let resolved = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      await resolveApproval(id, action, resolvedBy, note);
      resolved++;
    } catch (error) {
      log.warn("Failed to resolve approval", { id, error: (error as Error).message });
      failed++;
    }
  }

  log.info("Bulk resolved approvals", { action, resolved, failed });
  return { resolved, failed };
}

/**
 * Record notification sent.
 */
export async function recordApprovalNotification(
  id: string,
  notification: HarvestingApproval["notificationsSent"][0]
): Promise<void> {
  const db = getFirestore();
  const approval = await getApproval(id);

  if (!approval) {
    throw new Error("Approval not found");
  }

  await db.collection(APPROVALS_COLLECTION).doc(id).update({
    notificationsSent: [...approval.notificationsSent, notification],
  });
}

/**
 * Expire pending approvals that have passed their expiration time.
 */
export async function expireOldApprovals(): Promise<number> {
  const db = getFirestore();
  const now = new Date();

  const snapshot = await db
    .collection(APPROVALS_COLLECTION)
    .where("status", "==", ApprovalStatus.PENDING)
    .where("expiresAt", "<", now)
    .get();

  const batch = db.batch();
  for (const doc of snapshot.docs) {
    batch.update(doc.ref, {
      status: ApprovalStatus.EXPIRED,
      resolution: {
        resolvedAt: now,
        resolvedBy: "system",
        action: "deny",
        note: "Expired due to no response",
      },
    });
  }
  await batch.commit();

  if (snapshot.docs.length > 0) {
    log.info("Expired pending approvals", { count: snapshot.docs.length });
  }

  return snapshot.docs.length;
}

/**
 * Auto-approve pending approvals that have auto-approve configured.
 */
export async function processAutoApprovals(): Promise<number> {
  const db = getFirestore();
  const now = new Date();
  let autoApproved = 0;

  // Get all pending approvals
  const snapshot = await db
    .collection(APPROVALS_COLLECTION)
    .where("status", "==", ApprovalStatus.PENDING)
    .get();

  for (const doc of snapshot.docs) {
    const approval = doc.data() as HarvestingApproval;

    // Get the rule that triggered this approval
    const ruleSet = await getRuleSet(approval.triggeredRuleSetId);
    if (!ruleSet) continue;

    const rule = ruleSet.rules.find((r) => r.id === approval.triggeredRuleId);
    if (!rule || rule.action !== RuleAction.REQUIRE_APPROVAL) continue;

    const config = rule.approvalConfig;
    if (!config?.autoApproveAfterMinutes) continue;

    // Check if auto-approve time has passed
    const createdAt = (approval.createdAt as unknown as { toDate: () => Date })?.toDate?.() || approval.createdAt;
    const autoApproveTime = new Date(createdAt.getTime() + config.autoApproveAfterMinutes * 60 * 1000);

    if (now >= autoApproveTime) {
      await db.collection(APPROVALS_COLLECTION).doc(doc.id).update({
        status: ApprovalStatus.AUTO_APPROVED,
        resolution: {
          resolvedAt: now,
          resolvedBy: "auto",
          action: "approve",
          note: `Auto-approved after ${config.autoApproveAfterMinutes} minutes with no response`,
        },
      });
      autoApproved++;
    }
  }

  if (autoApproved > 0) {
    log.info("Auto-approved approvals", { count: autoApproved });
  }

  return autoApproved;
}
