/**
 * Onboarding wizard session models.
 */

import { z } from "zod";
import { DeploymentModel, OrganizationPlan } from "./organization.js";
import { ConnectionMethod } from "./cloud-connection.js";

// ============================================================================
// Enums
// ============================================================================

export enum OnboardingStep {
  WELCOME = "welcome",
  ORGANIZATION_DETAILS = "organization_details",
  DEPLOYMENT_MODEL = "deployment_model",
  CONNECT_CLOUD = "connect_cloud",
  VERIFY_PERMISSIONS = "verify_permissions",
  DISCOVER_CLUSTERS = "discover_clusters",
  SELECT_CLUSTERS = "select_clusters",
  INSTALL_AGENT = "install_agent",
  VERIFY_AGENT = "verify_agent",
  CONFIGURE_RULES = "configure_rules",
  GENERATE_API_KEYS = "generate_api_keys",
  COMPLETE = "complete",
}

export const ONBOARDING_STEP_ORDER: OnboardingStep[] = [
  OnboardingStep.WELCOME,
  OnboardingStep.ORGANIZATION_DETAILS,
  OnboardingStep.DEPLOYMENT_MODEL,
  OnboardingStep.CONNECT_CLOUD,
  OnboardingStep.VERIFY_PERMISSIONS,
  OnboardingStep.DISCOVER_CLUSTERS,
  OnboardingStep.SELECT_CLUSTERS,
  OnboardingStep.INSTALL_AGENT,
  OnboardingStep.VERIFY_AGENT,
  OnboardingStep.CONFIGURE_RULES,
  OnboardingStep.GENERATE_API_KEYS,
  OnboardingStep.COMPLETE,
];

// ============================================================================
// Step Data Types
// ============================================================================

export interface WelcomeStepData {
  acknowledged: boolean;
  source?: string;  // How they found us
}

export interface OrganizationDetailsStepData {
  name: string;
  domain?: string;
  billingEmail: string;
  plan: OrganizationPlan;
}

export interface DeploymentModelStepData {
  deploymentModel: DeploymentModel;
}

export interface ConnectCloudStepData {
  projectId: string;
  connectionMethod: ConnectionMethod;
  serviceAccountEmail?: string;
  credentialsUploaded?: boolean;
}

export interface VerifyPermissionsStepData {
  allPermissionsGranted: boolean;
  permissionResults: Record<string, boolean>;
  errors: string[];
}

export interface DiscoverClustersStepData {
  discoveryCompleted: boolean;
  clustersFound: Array<{
    name: string;
    location: string;
    gpuNodePools: Array<{
      name: string;
      gpuType: string;
      totalGpus: number;
    }>;
  }>;
}

export interface SelectClustersStepData {
  selectedClusterNames: string[];
}

export interface InstallAgentStepData {
  installCommand: string;
  helmCommand: string;
  installMethod: "kubectl" | "helm";
}

export interface VerifyAgentStepData {
  allAgentsVerified: boolean;
  agentStatuses: Record<string, {
    installed: boolean;
    healthy: boolean;
    version?: string;
  }>;
}

export interface ConfigureRulesStepData {
  useDefaultRules: boolean;
  customRulesCreated: number;
  ruleSetId?: string;
}

export interface GenerateApiKeysStepData {
  apiKeyGenerated: boolean;
  apiKeyId?: string;
  apiKeyPrefix?: string;
  // Note: actual key is only shown once and not stored here
}

export interface OnboardingStepData {
  welcome?: WelcomeStepData;
  organizationDetails?: OrganizationDetailsStepData;
  deploymentModel?: DeploymentModelStepData;
  connectCloud?: ConnectCloudStepData;
  verifyPermissions?: VerifyPermissionsStepData;
  discoverClusters?: DiscoverClustersStepData;
  selectClusters?: SelectClustersStepData;
  installAgent?: InstallAgentStepData;
  verifyAgent?: VerifyAgentStepData;
  configureRules?: ConfigureRulesStepData;
  generateApiKeys?: GenerateApiKeysStepData;
}

// ============================================================================
// Session Type
// ============================================================================

export interface OnboardingSession {
  id: string;

  // Organization (created during onboarding)
  organizationId?: string;

  // User info
  email: string;

  // Current step
  currentStep: OnboardingStep;

  // Step data (persisted between steps)
  stepData: OnboardingStepData;

  // Progress tracking
  completedSteps: OnboardingStep[];
  skippedSteps: OnboardingStep[];

  // Timing
  startedAt: Date;
  lastActivityAt: Date;
  completedAt?: Date;

  // For resuming
  resumeToken: string;

  // Error tracking
  lastError?: string;
  errorCount: number;
}

// ============================================================================
// Schemas for Step Submissions
// ============================================================================

export const WelcomeStepSchema = z.object({
  acknowledged: z.boolean(),
  source: z.string().optional(),
});

export const OrganizationDetailsStepSchema = z.object({
  name: z.string().min(2).max(100),
  domain: z.string().optional(),
  billingEmail: z.string().email(),
  plan: z.nativeEnum(OrganizationPlan).default(OrganizationPlan.FREE),
});

export const DeploymentModelStepSchema = z.object({
  deploymentModel: z.nativeEnum(DeploymentModel),
});

export const ConnectCloudStepSchema = z.object({
  projectId: z.string().min(6).max(30),
  connectionMethod: z.nativeEnum(ConnectionMethod),
  serviceAccountEmail: z.string().email().optional(),
  credentials: z.string().optional(), // Base64 encoded
});

export const SelectClustersStepSchema = z.object({
  selectedClusterNames: z.array(z.string()).min(1),
});

export const ConfigureRulesStepSchema = z.object({
  useDefaultRules: z.boolean(),
  customRules: z.array(z.object({
    name: z.string(),
    priority: z.number(),
    conditions: z.object({}).passthrough(),
    action: z.string(),
  })).optional(),
});

export const GenerateApiKeysStepSchema = z.object({
  keyName: z.string().min(2).max(100).default("Default API Key"),
});

// ============================================================================
// Step Configuration
// ============================================================================

export interface StepConfig {
  step: OnboardingStep;
  title: string;
  description: string;
  required: boolean;
  skippable: boolean;
  estimatedMinutes: number;
}

export const STEP_CONFIGS: Record<OnboardingStep, StepConfig> = {
  [OnboardingStep.WELCOME]: {
    step: OnboardingStep.WELCOME,
    title: "Welcome to Xid-R",
    description: "Learn about GPU harvesting for AI agents",
    required: true,
    skippable: false,
    estimatedMinutes: 1,
  },
  [OnboardingStep.ORGANIZATION_DETAILS]: {
    step: OnboardingStep.ORGANIZATION_DETAILS,
    title: "Organization Details",
    description: "Tell us about your organization",
    required: true,
    skippable: false,
    estimatedMinutes: 2,
  },
  [OnboardingStep.DEPLOYMENT_MODEL]: {
    step: OnboardingStep.DEPLOYMENT_MODEL,
    title: "Deployment Model",
    description: "Choose how you want to deploy Xid-R",
    required: true,
    skippable: false,
    estimatedMinutes: 1,
  },
  [OnboardingStep.CONNECT_CLOUD]: {
    step: OnboardingStep.CONNECT_CLOUD,
    title: "Connect Cloud Provider",
    description: "Connect your GCP project to Xid-R",
    required: true,
    skippable: false,
    estimatedMinutes: 5,
  },
  [OnboardingStep.VERIFY_PERMISSIONS]: {
    step: OnboardingStep.VERIFY_PERMISSIONS,
    title: "Verify Permissions",
    description: "We'll verify we have the necessary access",
    required: true,
    skippable: false,
    estimatedMinutes: 1,
  },
  [OnboardingStep.DISCOVER_CLUSTERS]: {
    step: OnboardingStep.DISCOVER_CLUSTERS,
    title: "Discover Clusters",
    description: "Finding your GKE clusters with GPUs",
    required: true,
    skippable: false,
    estimatedMinutes: 2,
  },
  [OnboardingStep.SELECT_CLUSTERS]: {
    step: OnboardingStep.SELECT_CLUSTERS,
    title: "Select Clusters",
    description: "Choose which clusters Xid-R should manage",
    required: true,
    skippable: false,
    estimatedMinutes: 1,
  },
  [OnboardingStep.INSTALL_AGENT]: {
    step: OnboardingStep.INSTALL_AGENT,
    title: "Install Agent",
    description: "Deploy the Xid-R agent to your clusters",
    required: true,
    skippable: false,
    estimatedMinutes: 5,
  },
  [OnboardingStep.VERIFY_AGENT]: {
    step: OnboardingStep.VERIFY_AGENT,
    title: "Verify Agent",
    description: "Confirming the agent is running correctly",
    required: true,
    skippable: false,
    estimatedMinutes: 2,
  },
  [OnboardingStep.CONFIGURE_RULES]: {
    step: OnboardingStep.CONFIGURE_RULES,
    title: "Configure Harvesting Rules",
    description: "Set up rules for when to harvest idle GPUs",
    required: false,
    skippable: true,
    estimatedMinutes: 5,
  },
  [OnboardingStep.GENERATE_API_KEYS]: {
    step: OnboardingStep.GENERATE_API_KEYS,
    title: "Generate API Keys",
    description: "Create keys for your agents to access Xid-R",
    required: true,
    skippable: false,
    estimatedMinutes: 1,
  },
  [OnboardingStep.COMPLETE]: {
    step: OnboardingStep.COMPLETE,
    title: "Setup Complete!",
    description: "You're ready to start harvesting GPU capacity",
    required: true,
    skippable: false,
    estimatedMinutes: 0,
  },
};

// ============================================================================
// Helpers
// ============================================================================

export function getNextStep(currentStep: OnboardingStep): OnboardingStep | null {
  const currentIndex = ONBOARDING_STEP_ORDER.indexOf(currentStep);
  if (currentIndex === -1 || currentIndex >= ONBOARDING_STEP_ORDER.length - 1) {
    return null;
  }
  return ONBOARDING_STEP_ORDER[currentIndex + 1];
}

export function getPreviousStep(currentStep: OnboardingStep): OnboardingStep | null {
  const currentIndex = ONBOARDING_STEP_ORDER.indexOf(currentStep);
  if (currentIndex <= 0) {
    return null;
  }
  return ONBOARDING_STEP_ORDER[currentIndex - 1];
}

export function getStepProgress(currentStep: OnboardingStep): { current: number; total: number; percent: number } {
  const currentIndex = ONBOARDING_STEP_ORDER.indexOf(currentStep);
  const total = ONBOARDING_STEP_ORDER.length;
  const current = currentIndex + 1;
  const percent = Math.round((current / total) * 100);
  return { current, total, percent };
}

export function isStepComplete(session: OnboardingSession, step: OnboardingStep): boolean {
  return session.completedSteps.includes(step) || session.skippedSteps.includes(step);
}

export function canSkipStep(step: OnboardingStep): boolean {
  return STEP_CONFIGS[step].skippable;
}

export function getEstimatedTotalTime(): number {
  return Object.values(STEP_CONFIGS).reduce((sum, config) => sum + config.estimatedMinutes, 0);
}

export function createNewSession(email: string): Omit<OnboardingSession, "id"> {
  return {
    email,
    currentStep: OnboardingStep.WELCOME,
    stepData: {},
    completedSteps: [],
    skippedSteps: [],
    startedAt: new Date(),
    lastActivityAt: new Date(),
    resumeToken: generateResumeToken(),
    errorCount: 0,
  };
}

function generateResumeToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
