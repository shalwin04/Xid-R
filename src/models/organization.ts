/**
 * Organization and member models for enterprise onboarding.
 */

import { z } from "zod";

// ============================================================================
// Enums
// ============================================================================

export enum OrganizationStatus {
  PENDING_VERIFICATION = "pending_verification",
  ACTIVE = "active",
  SUSPENDED = "suspended",
  CHURNED = "churned",
}

export enum OrganizationPlan {
  FREE = "free",
  PRO = "pro",
  ENTERPRISE = "enterprise",
}

export enum DeploymentModel {
  SAAS = "saas",
  HYBRID = "hybrid",
  SELF_HOSTED = "self_hosted",
}

export enum MemberRole {
  OWNER = "owner",
  ADMIN = "admin",
  MEMBER = "member",
  VIEWER = "viewer",
}

export enum MemberStatus {
  INVITED = "invited",
  ACTIVE = "active",
  DISABLED = "disabled",
}

export enum AuthProvider {
  EMAIL = "email",
  GOOGLE = "google",
  GITHUB = "github",
  SAML = "saml",
}

// ============================================================================
// Types
// ============================================================================

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OnboardingProgress {
  emailVerified: boolean;
  cloudConnected: boolean;
  agentInstalled: boolean;
  firstGpuDiscovered: boolean;
  firstLeaseCompleted: boolean;
  rulesConfigured: boolean;
  teamInvited: boolean;
}

export interface OrganizationSettings {
  defaultIdleThresholdPercent: number;
  defaultIdleDurationMinutes: number;
  defaultPreemptionGraceSeconds: number;
  checkpointBucket: string;
  notificationEmail: string;
  slackWebhook?: string;
  timezone: string;
}

export interface Organization {
  id: string;
  name: string;
  domain: string;

  // Status
  status: OrganizationStatus;

  // Billing
  billingEmail: string;
  billingAddress?: Address;
  stripeCustomerId?: string;

  // Plan
  plan: OrganizationPlan;
  planStartDate: Date;
  planEndDate?: Date;

  // Deployment model
  deploymentModel: DeploymentModel;

  // Onboarding progress
  onboarding: OnboardingProgress;

  // Settings
  settings: OrganizationSettings;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: MemberRole;

  // Auth
  authProvider: AuthProvider;
  authProviderId?: string;

  // Status
  status: MemberStatus;
  invitedBy?: string;
  invitedAt?: Date;
  joinedAt?: Date;
  lastLoginAt?: Date;

  // Timestamps
  createdAt: Date;
}

// ============================================================================
// Schemas
// ============================================================================

export const CreateOrganizationSchema = z.object({
  name: z.string().min(2).max(100),
  domain: z.string().optional(),
  billingEmail: z.string().email(),
  plan: z.nativeEnum(OrganizationPlan).default(OrganizationPlan.FREE),
  deploymentModel: z.nativeEnum(DeploymentModel).default(DeploymentModel.SAAS),
});

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  domain: z.string().optional(),
  billingEmail: z.string().email().optional(),
  billingAddress: z.object({
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    country: z.string(),
  }).optional(),
  settings: z.object({
    defaultIdleThresholdPercent: z.number().min(0).max(100).optional(),
    defaultIdleDurationMinutes: z.number().min(1).max(60).optional(),
    defaultPreemptionGraceSeconds: z.number().min(30).max(300).optional(),
    checkpointBucket: z.string().optional(),
    notificationEmail: z.string().email().optional(),
    slackWebhook: z.string().url().optional(),
    timezone: z.string().optional(),
  }).optional(),
});

export const InviteMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  role: z.nativeEnum(MemberRole).default(MemberRole.MEMBER),
});

// ============================================================================
// Plan Limits
// ============================================================================

export interface PlanLimits {
  maxGpusMonitored: number;
  maxGpuHoursPerMonth: number;
  maxClusters: number;
  maxTeamMembers: number;
  features: {
    sso: boolean;
    customRules: boolean;
    slackIntegration: boolean;
    apiAccess: boolean;
    prioritySupport: boolean;
    sla: boolean;
  };
}

export const PLAN_LIMITS: Record<OrganizationPlan, PlanLimits> = {
  [OrganizationPlan.FREE]: {
    maxGpusMonitored: 2,
    maxGpuHoursPerMonth: 100,
    maxClusters: 1,
    maxTeamMembers: 2,
    features: {
      sso: false,
      customRules: false,
      slackIntegration: false,
      apiAccess: true,
      prioritySupport: false,
      sla: false,
    },
  },
  [OrganizationPlan.PRO]: {
    maxGpusMonitored: 20,
    maxGpuHoursPerMonth: 2000,
    maxClusters: 5,
    maxTeamMembers: 10,
    features: {
      sso: false,
      customRules: true,
      slackIntegration: true,
      apiAccess: true,
      prioritySupport: true,
      sla: false,
    },
  },
  [OrganizationPlan.ENTERPRISE]: {
    maxGpusMonitored: -1, // Unlimited
    maxGpuHoursPerMonth: -1,
    maxClusters: -1,
    maxTeamMembers: -1,
    features: {
      sso: true,
      customRules: true,
      slackIntegration: true,
      apiAccess: true,
      prioritySupport: true,
      sla: true,
    },
  },
};

// ============================================================================
// Helpers
// ============================================================================

export function createDefaultSettings(): OrganizationSettings {
  return {
    defaultIdleThresholdPercent: 15,
    defaultIdleDurationMinutes: 5,
    defaultPreemptionGraceSeconds: 120,
    checkpointBucket: "",
    notificationEmail: "",
    timezone: "UTC",
  };
}

export function createDefaultOnboarding(): OnboardingProgress {
  return {
    emailVerified: false,
    cloudConnected: false,
    agentInstalled: false,
    firstGpuDiscovered: false,
    firstLeaseCompleted: false,
    rulesConfigured: false,
    teamInvited: false,
  };
}

export function getPlanLimits(plan: OrganizationPlan): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function canAccessFeature(plan: OrganizationPlan, feature: keyof PlanLimits["features"]): boolean {
  return PLAN_LIMITS[plan].features[feature];
}
