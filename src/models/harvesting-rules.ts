/**
 * Harvesting rules and approval workflow models.
 */

import { z } from "zod";

// ============================================================================
// Enums
// ============================================================================

export enum RuleAction {
  AUTO_APPROVE = "auto_approve",
  REQUIRE_APPROVAL = "require_approval",
  DENY = "deny",
}

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  DENIED = "denied",
  EXPIRED = "expired",
  AUTO_APPROVED = "auto_approved",
}

export enum NotificationChannel {
  EMAIL = "email",
  SLACK = "slack",
  WEBHOOK = "webhook",
}

// ============================================================================
// Types
// ============================================================================

export interface TimeWindow {
  daysOfWeek: number[];     // 0=Sun, 1=Mon, ... 6=Sat
  startHour: number;        // 0-23
  endHour: number;          // 0-23
  timezone: string;         // e.g., "America/Los_Angeles"
}

export interface RuleConditions {
  // GPU type filter
  gpuTypes?: string[];              // ["nvidia-t4", "nvidia-l4"]

  // Value threshold
  gpuValueMaxUsd?: number;          // Only GPUs worth < $X/hour
  gpuValueMinUsd?: number;          // Only GPUs worth > $X/hour

  // Node/namespace patterns (glob patterns)
  nodePoolPatterns?: string[];      // ["dev-*", "test-*"]
  namespacePatterns?: string[];     // ["default", "staging-*"]
  nodeNamePatterns?: string[];      // ["*-spot-*"]

  // Label selectors
  labelSelectors?: Record<string, string>;  // { "environment": "dev" }
  labelSelectorsAny?: Record<string, string[]>;  // { "team": ["ml", "research"] }

  // Time windows
  timeWindows?: TimeWindow[];

  // Utilization thresholds (override defaults)
  idleThresholdPercent?: number;
  idleDurationMinutes?: number;

  // Tenant restrictions
  tenantTiers?: string[];           // ["internal", "trusted"]
  excludeTenantIds?: string[];
}

export interface ApprovalConfig {
  // Notifications
  notifyEmails: string[];
  notifySlack: boolean;
  slackChannel?: string;
  webhookUrl?: string;

  // Auto-approval
  autoApproveAfterMinutes?: number;  // Auto-approve if no response

  // Multi-approver
  requiredApprovers: number;         // 1 or 2
  approverRoles: ("owner" | "admin")[];
}

export interface HarvestingRule {
  id: string;
  name: string;
  description: string;
  priority: number;           // Lower = evaluated first
  enabled: boolean;

  // Conditions (all must match for rule to apply)
  conditions: RuleConditions;

  // Action to take
  action: RuleAction;

  // If require_approval
  approvalConfig?: ApprovalConfig;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface HarvestingRuleSet {
  id: string;
  organizationId: string;
  name: string;
  description: string;

  // Rules (ordered by priority)
  rules: HarvestingRule[];

  // Applied to clusters (IDs or ["*"] for all)
  appliedToClusters: string[];

  // Is this the default rule set?
  isDefault: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// ============================================================================
// Approval Types
// ============================================================================

export interface ApprovalNotification {
  channel: NotificationChannel;
  sentAt: Date;
  recipient: string;
  messageId?: string;
}

export interface ApprovalResolution {
  resolvedAt: Date;
  resolvedBy: string;         // User ID or "auto" or "system"
  action: "approve" | "deny";
  note?: string;
}

export interface HarvestingApproval {
  id: string;
  organizationId: string;
  clusterId: string;
  capacityUnitId: string;

  // GPU details
  gpuType: string;
  nodeName: string;
  nodePool: string;
  gpuIndex: number;

  // Current state
  idleMinutes: number;
  utilizationPercent: number;
  estimatedValuePerHourUsd: number;

  // Requesting tenant (if any)
  requestingTenantId?: string;
  requestingAgentId?: string;
  requestingAgentName?: string;

  // Rule that triggered this
  triggeredRuleSetId: string;
  triggeredRuleId: string;
  triggeredRuleName: string;

  // Status
  status: ApprovalStatus;

  // Resolution
  resolution?: ApprovalResolution;

  // Notifications
  notificationsSent: ApprovalNotification[];

  // Timestamps
  createdAt: Date;
  expiresAt: Date;

  // For multi-approver
  approvals: Array<{
    userId: string;
    approvedAt: Date;
  }>;
}

// ============================================================================
// Schemas
// ============================================================================

export const TimeWindowSchema = z.object({
  daysOfWeek: z.array(z.number().min(0).max(6)),
  startHour: z.number().min(0).max(23),
  endHour: z.number().min(0).max(23),
  timezone: z.string(),
});

export const RuleConditionsSchema = z.object({
  gpuTypes: z.array(z.string()).optional(),
  gpuValueMaxUsd: z.number().positive().optional(),
  gpuValueMinUsd: z.number().positive().optional(),
  nodePoolPatterns: z.array(z.string()).optional(),
  namespacePatterns: z.array(z.string()).optional(),
  nodeNamePatterns: z.array(z.string()).optional(),
  labelSelectors: z.record(z.string()).optional(),
  labelSelectorsAny: z.record(z.array(z.string())).optional(),
  timeWindows: z.array(TimeWindowSchema).optional(),
  idleThresholdPercent: z.number().min(0).max(100).optional(),
  idleDurationMinutes: z.number().min(1).max(60).optional(),
  tenantTiers: z.array(z.string()).optional(),
  excludeTenantIds: z.array(z.string()).optional(),
});

export const ApprovalConfigSchema = z.object({
  notifyEmails: z.array(z.string().email()),
  notifySlack: z.boolean().default(false),
  slackChannel: z.string().optional(),
  webhookUrl: z.string().url().optional(),
  autoApproveAfterMinutes: z.number().min(5).max(1440).optional(),
  requiredApprovers: z.number().min(1).max(3).default(1),
  approverRoles: z.array(z.enum(["owner", "admin"])).default(["owner", "admin"]),
});

export const CreateHarvestingRuleSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).default(""),
  priority: z.number().min(1).max(1000).default(100),
  enabled: z.boolean().default(true),
  conditions: RuleConditionsSchema,
  action: z.nativeEnum(RuleAction),
  approvalConfig: ApprovalConfigSchema.optional(),
});

export const CreateRuleSetSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).default(""),
  rules: z.array(CreateHarvestingRuleSchema).default([]),
  appliedToClusters: z.array(z.string()).default(["*"]),
  isDefault: z.boolean().default(false),
});

export const ResolveApprovalSchema = z.object({
  action: z.enum(["approve", "deny"]),
  note: z.string().max(500).optional(),
});

export const BulkResolveApprovalsSchema = z.object({
  approvalIds: z.array(z.string()).min(1).max(100),
  action: z.enum(["approve", "deny"]),
  note: z.string().max(500).optional(),
});

// ============================================================================
// Rule Evaluation
// ============================================================================

export interface RuleEvaluationContext {
  gpuType: string;
  gpuValuePerHourUsd: number;
  nodePool: string;
  nodeName: string;
  namespace?: string;
  labels: Record<string, string>;
  utilizationPercent: number;
  idleMinutes: number;
  tenantTier?: string;
  tenantId?: string;
  currentTime: Date;
}

export interface RuleEvaluationResult {
  matched: boolean;
  matchedRule?: HarvestingRule;
  action: RuleAction;
  explanation: string;
  matchedConditions: string[];
  failedConditions: string[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a glob pattern matches a string.
 */
export function matchGlobPattern(pattern: string, value: string): boolean {
  const regex = new RegExp(
    "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
  );
  return regex.test(value);
}

/**
 * Check if current time is within any of the time windows.
 */
export function isWithinTimeWindows(windows: TimeWindow[], currentTime: Date): boolean {
  if (!windows || windows.length === 0) return true;

  for (const window of windows) {
    // Convert to window's timezone
    const timeStr = currentTime.toLocaleString("en-US", { timeZone: window.timezone });
    const localTime = new Date(timeStr);

    const dayOfWeek = localTime.getDay();
    const hour = localTime.getHours();

    if (window.daysOfWeek.includes(dayOfWeek)) {
      if (window.startHour <= window.endHour) {
        // Same day window (e.g., 9-17)
        if (hour >= window.startHour && hour < window.endHour) {
          return true;
        }
      } else {
        // Overnight window (e.g., 22-6)
        if (hour >= window.startHour || hour < window.endHour) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Evaluate conditions against context.
 */
export function evaluateConditions(
  conditions: RuleConditions,
  context: RuleEvaluationContext
): { matched: boolean; matchedConditions: string[]; failedConditions: string[] } {
  const matchedConditions: string[] = [];
  const failedConditions: string[] = [];

  // GPU type
  if (conditions.gpuTypes && conditions.gpuTypes.length > 0) {
    if (conditions.gpuTypes.includes(context.gpuType)) {
      matchedConditions.push(`GPU type: ${context.gpuType}`);
    } else {
      failedConditions.push(`GPU type ${context.gpuType} not in ${conditions.gpuTypes.join(", ")}`);
      return { matched: false, matchedConditions, failedConditions };
    }
  }

  // GPU value
  if (conditions.gpuValueMaxUsd !== undefined) {
    if (context.gpuValuePerHourUsd <= conditions.gpuValueMaxUsd) {
      matchedConditions.push(`GPU value $${context.gpuValuePerHourUsd}/hr <= $${conditions.gpuValueMaxUsd}/hr`);
    } else {
      failedConditions.push(`GPU value $${context.gpuValuePerHourUsd}/hr > $${conditions.gpuValueMaxUsd}/hr max`);
      return { matched: false, matchedConditions, failedConditions };
    }
  }

  if (conditions.gpuValueMinUsd !== undefined) {
    if (context.gpuValuePerHourUsd >= conditions.gpuValueMinUsd) {
      matchedConditions.push(`GPU value $${context.gpuValuePerHourUsd}/hr >= $${conditions.gpuValueMinUsd}/hr`);
    } else {
      failedConditions.push(`GPU value $${context.gpuValuePerHourUsd}/hr < $${conditions.gpuValueMinUsd}/hr min`);
      return { matched: false, matchedConditions, failedConditions };
    }
  }

  // Node pool patterns
  if (conditions.nodePoolPatterns && conditions.nodePoolPatterns.length > 0) {
    const matches = conditions.nodePoolPatterns.some(p => matchGlobPattern(p, context.nodePool));
    if (matches) {
      matchedConditions.push(`Node pool ${context.nodePool} matches pattern`);
    } else {
      failedConditions.push(`Node pool ${context.nodePool} doesn't match patterns`);
      return { matched: false, matchedConditions, failedConditions };
    }
  }

  // Node name patterns
  if (conditions.nodeNamePatterns && conditions.nodeNamePatterns.length > 0) {
    const matches = conditions.nodeNamePatterns.some(p => matchGlobPattern(p, context.nodeName));
    if (matches) {
      matchedConditions.push(`Node name ${context.nodeName} matches pattern`);
    } else {
      failedConditions.push(`Node name ${context.nodeName} doesn't match patterns`);
      return { matched: false, matchedConditions, failedConditions };
    }
  }

  // Label selectors (all must match)
  if (conditions.labelSelectors) {
    for (const [key, value] of Object.entries(conditions.labelSelectors)) {
      if (context.labels[key] === value) {
        matchedConditions.push(`Label ${key}=${value}`);
      } else {
        failedConditions.push(`Label ${key} is ${context.labels[key] || "missing"}, expected ${value}`);
        return { matched: false, matchedConditions, failedConditions };
      }
    }
  }

  // Label selectors any (at least one value must match)
  if (conditions.labelSelectorsAny) {
    for (const [key, values] of Object.entries(conditions.labelSelectorsAny)) {
      if (values.includes(context.labels[key])) {
        matchedConditions.push(`Label ${key}=${context.labels[key]} in [${values.join(", ")}]`);
      } else {
        failedConditions.push(`Label ${key} is ${context.labels[key] || "missing"}, expected one of [${values.join(", ")}]`);
        return { matched: false, matchedConditions, failedConditions };
      }
    }
  }

  // Time windows
  if (conditions.timeWindows && conditions.timeWindows.length > 0) {
    if (isWithinTimeWindows(conditions.timeWindows, context.currentTime)) {
      matchedConditions.push("Within allowed time window");
    } else {
      failedConditions.push("Outside allowed time windows");
      return { matched: false, matchedConditions, failedConditions };
    }
  }

  // Idle threshold
  if (conditions.idleThresholdPercent !== undefined) {
    if (context.utilizationPercent <= conditions.idleThresholdPercent) {
      matchedConditions.push(`Utilization ${context.utilizationPercent}% <= ${conditions.idleThresholdPercent}% threshold`);
    } else {
      failedConditions.push(`Utilization ${context.utilizationPercent}% > ${conditions.idleThresholdPercent}% threshold`);
      return { matched: false, matchedConditions, failedConditions };
    }
  }

  // Idle duration
  if (conditions.idleDurationMinutes !== undefined) {
    if (context.idleMinutes >= conditions.idleDurationMinutes) {
      matchedConditions.push(`Idle ${context.idleMinutes} min >= ${conditions.idleDurationMinutes} min required`);
    } else {
      failedConditions.push(`Idle ${context.idleMinutes} min < ${conditions.idleDurationMinutes} min required`);
      return { matched: false, matchedConditions, failedConditions };
    }
  }

  // Tenant restrictions
  if (conditions.tenantTiers && conditions.tenantTiers.length > 0) {
    if (context.tenantTier && conditions.tenantTiers.includes(context.tenantTier)) {
      matchedConditions.push(`Tenant tier ${context.tenantTier} allowed`);
    } else {
      failedConditions.push(`Tenant tier ${context.tenantTier || "unknown"} not in allowed tiers`);
      return { matched: false, matchedConditions, failedConditions };
    }
  }

  if (conditions.excludeTenantIds && conditions.excludeTenantIds.length > 0) {
    if (context.tenantId && conditions.excludeTenantIds.includes(context.tenantId)) {
      failedConditions.push(`Tenant ${context.tenantId} is excluded`);
      return { matched: false, matchedConditions, failedConditions };
    } else {
      matchedConditions.push("Tenant not excluded");
    }
  }

  return { matched: true, matchedConditions, failedConditions };
}

/**
 * Evaluate a rule set against context.
 */
export function evaluateRuleSet(
  ruleSet: HarvestingRuleSet,
  context: RuleEvaluationContext
): RuleEvaluationResult {
  // Sort rules by priority
  const sortedRules = [...ruleSet.rules]
    .filter(r => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    const { matched, matchedConditions, failedConditions } = evaluateConditions(
      rule.conditions,
      context
    );

    if (matched) {
      return {
        matched: true,
        matchedRule: rule,
        action: rule.action,
        explanation: `Rule "${rule.name}" matched`,
        matchedConditions,
        failedConditions: [],
      };
    }
  }

  // No rules matched - default to require approval
  return {
    matched: false,
    action: RuleAction.REQUIRE_APPROVAL,
    explanation: "No rules matched, defaulting to require approval",
    matchedConditions: [],
    failedConditions: ["No matching rules"],
  };
}

/**
 * Create default rules for a new organization.
 */
export function createDefaultRules(): HarvestingRule[] {
  return [
    {
      id: "rule_dev_auto",
      name: "Dev/Test Auto-Approve",
      description: "Automatically approve harvesting for dev and test node pools during business hours",
      priority: 10,
      enabled: true,
      conditions: {
        nodePoolPatterns: ["dev-*", "test-*", "staging-*"],
        timeWindows: [{
          daysOfWeek: [1, 2, 3, 4, 5],  // Mon-Fri
          startHour: 9,
          endHour: 18,
          timezone: "UTC",
        }],
      },
      action: RuleAction.AUTO_APPROVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "system",
    },
    {
      id: "rule_a100_manual",
      name: "A100 Manual Approval",
      description: "Require manual approval for high-value A100 GPUs",
      priority: 5,
      enabled: true,
      conditions: {
        gpuTypes: ["nvidia-a100-40gb", "nvidia-a100-80gb"],
      },
      action: RuleAction.REQUIRE_APPROVAL,
      approvalConfig: {
        notifyEmails: [],
        notifySlack: false,
        requiredApprovers: 1,
        approverRoles: ["owner", "admin"],
        autoApproveAfterMinutes: 30,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "system",
    },
    {
      id: "rule_default_manual",
      name: "Default Manual Approval",
      description: "Require manual approval for all other GPUs",
      priority: 100,
      enabled: true,
      conditions: {},  // Match everything
      action: RuleAction.REQUIRE_APPROVAL,
      approvalConfig: {
        notifyEmails: [],
        notifySlack: false,
        requiredApprovers: 1,
        approverRoles: ["owner", "admin"],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "system",
    },
  ];
}
