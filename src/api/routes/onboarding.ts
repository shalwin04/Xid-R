/**
 * Onboarding wizard API routes.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import {
  createOnboardingSession,
  getOnboardingSession,
  getOnboardingSessionByToken,
  getOnboardingSessionByEmail,
  completeOnboardingStep,
  skipOnboardingStep,
  recordOnboardingError,
  setSessionOrganization,
} from "../../db/onboarding.js";
import {
  createOrganization,
  getOrganization,
  updateOrganization,
  updateOnboardingProgress,
  activateOrganization,
} from "../../db/organizations.js";
import {
  createCloudConnection,
  getCloudConnection,
  updateConnectionStatus,
  markPermissionsVerified,
  createManagedCluster,
  getManagedClusterByName,
  listManagedClusters,
  updateClusterManagementStatus,
} from "../../db/cloud-connections.js";
import {
  createRuleSet,
  getDefaultRuleSet,
} from "../../db/harvesting-rules.js";
import {
  createTenant,
  createApiKey,
} from "../../db/tenants.js";
import { TenantTier } from "../../models/tenant.js";

import {
  OnboardingStep,
  STEP_CONFIGS,
  getStepProgress,
  canSkipStep,
  WelcomeStepSchema,
  OrganizationDetailsStepSchema,
  DeploymentModelStepSchema,
  ConnectCloudStepSchema,
  SelectClustersStepSchema,
  ConfigureRulesStepSchema,
  GenerateApiKeysStepSchema,
} from "../../models/onboarding.js";
import {
  ConnectionStatus,
  ClusterManagementStatus,
  ClusterType,
  ConnectionMethod,
  CloudProvider,
  REQUIRED_GCP_PERMISSIONS,
  getAgentInstallCommand,
  getHelmInstallCommand,
} from "../../models/cloud-connection.js";
import { createDefaultRules } from "../../models/harvesting-rules.js";

import { createLogger } from "../../utils/logger.js";
import { getConfig } from "../../config.js";

const log = createLogger({ module: "api:onboarding" });
const config = getConfig();

export const onboardingRoutes = new Hono();

// ============================================================================
// Session Management
// ============================================================================

/**
 * Start a new onboarding session.
 */
onboardingRoutes.post(
  "/start",
  zValidator("json", z.object({
    email: z.string().email(),
    source: z.string().optional(),
  })),
  async (c) => {
    const { email, source } = c.req.valid("json");

    try {
      // Check for existing incomplete session
      const existing = await getOnboardingSessionByEmail(email);
      if (existing) {
        return c.json({
          sessionId: existing.id,
          resumeToken: existing.resumeToken,
          currentStep: existing.currentStep,
          message: "Found existing session",
        });
      }

      // Create new session
      const session = await createOnboardingSession(email);

      // Record source in step data
      if (source) {
        await completeOnboardingStep(session.id, OnboardingStep.WELCOME, {
          welcome: { acknowledged: false, source },
        });
      }

      return c.json({
        sessionId: session.id,
        resumeToken: session.resumeToken,
        currentStep: session.currentStep,
        message: "New session created",
      }, 201);
    } catch (error) {
      log.error("Failed to start onboarding", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Resume an existing session.
 */
onboardingRoutes.post(
  "/resume",
  zValidator("json", z.object({
    resumeToken: z.string(),
  })),
  async (c) => {
    const { resumeToken } = c.req.valid("json");

    try {
      const session = await getOnboardingSessionByToken(resumeToken);
      if (!session) {
        return c.json({ error: "Session not found or expired" }, 404);
      }

      return c.json({
        sessionId: session.id,
        currentStep: session.currentStep,
        completedSteps: session.completedSteps,
        stepData: session.stepData,
        progress: getStepProgress(session.currentStep),
      });
    } catch (error) {
      log.error("Failed to resume session", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Get current session state.
 */
onboardingRoutes.get("/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");

  try {
    const session = await getOnboardingSession(sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const stepConfig = STEP_CONFIGS[session.currentStep];

    return c.json({
      session: {
        id: session.id,
        email: session.email,
        currentStep: session.currentStep,
        completedSteps: session.completedSteps,
        skippedSteps: session.skippedSteps,
        organizationId: session.organizationId,
        stepData: session.stepData,
        lastError: session.lastError,
      },
      currentStepConfig: stepConfig,
      progress: getStepProgress(session.currentStep),
      canSkip: canSkipStep(session.currentStep),
    });
  } catch (error) {
    log.error("Failed to get session", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

// ============================================================================
// Step Handlers
// ============================================================================

/**
 * Submit welcome step.
 */
onboardingRoutes.post(
  "/:sessionId/steps/welcome",
  zValidator("json", WelcomeStepSchema),
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const data = c.req.valid("json");

    try {
      const { nextStep, session } = await completeOnboardingStep(
        sessionId,
        OnboardingStep.WELCOME,
        { welcome: data }
      );

      return c.json({
        success: true,
        nextStep,
        progress: getStepProgress(nextStep || OnboardingStep.COMPLETE),
      });
    } catch (error) {
      log.error("Failed to complete welcome step", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Submit organization details step.
 */
onboardingRoutes.post(
  "/:sessionId/steps/organization_details",
  zValidator("json", OrganizationDetailsStepSchema),
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const data = c.req.valid("json");

    try {
      // Create organization
      const org = await createOrganization({
        name: data.name,
        domain: data.domain,
        billingEmail: data.billingEmail,
        plan: data.plan,
      });

      // Associate with session
      await setSessionOrganization(sessionId, org.id);

      const { nextStep } = await completeOnboardingStep(
        sessionId,
        OnboardingStep.ORGANIZATION_DETAILS,
        { organizationDetails: data }
      );

      return c.json({
        success: true,
        nextStep,
        organizationId: org.id,
        progress: getStepProgress(nextStep || OnboardingStep.COMPLETE),
      });
    } catch (error) {
      log.error("Failed to complete organization step", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Submit deployment model step.
 */
onboardingRoutes.post(
  "/:sessionId/steps/deployment_model",
  zValidator("json", DeploymentModelStepSchema),
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const data = c.req.valid("json");

    try {
      const session = await getOnboardingSession(sessionId);
      if (!session?.organizationId) {
        return c.json({ error: "Organization not created yet" }, 400);
      }

      // Update organization with deployment model
      await updateOrganization(session.organizationId, {
        deploymentModel: data.deploymentModel,
      });

      const { nextStep } = await completeOnboardingStep(
        sessionId,
        OnboardingStep.DEPLOYMENT_MODEL,
        { deploymentModel: data }
      );

      return c.json({
        success: true,
        nextStep,
        progress: getStepProgress(nextStep || OnboardingStep.COMPLETE),
      });
    } catch (error) {
      log.error("Failed to complete deployment model step", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Submit cloud connection step.
 */
onboardingRoutes.post(
  "/:sessionId/steps/connect_cloud",
  zValidator("json", ConnectCloudStepSchema),
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const data = c.req.valid("json");

    try {
      const session = await getOnboardingSession(sessionId);
      if (!session?.organizationId) {
        return c.json({ error: "Organization not created yet" }, 400);
      }

      // Create cloud connection
      const connection = await createCloudConnection({
        organizationId: session.organizationId,
        name: `GCP - ${data.projectId}`,
        provider: CloudProvider.GCP,
        gcp: {
          projectId: data.projectId,
          connectionMethod: data.connectionMethod,
          serviceAccountEmail: data.serviceAccountEmail,
          // Note: credentials would be encrypted before storage in production
          credentialsEncrypted: data.credentials,
        },
        createdBy: session.email,
      });

      const { nextStep } = await completeOnboardingStep(
        sessionId,
        OnboardingStep.CONNECT_CLOUD,
        {
          connectCloud: {
            projectId: data.projectId,
            connectionMethod: data.connectionMethod,
            serviceAccountEmail: data.serviceAccountEmail,
            credentialsUploaded: !!data.credentials,
          },
        }
      );

      return c.json({
        success: true,
        nextStep,
        connectionId: connection.id,
        progress: getStepProgress(nextStep || OnboardingStep.COMPLETE),
      });
    } catch (error) {
      log.error("Failed to complete cloud connection step", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Verify cloud permissions.
 */
onboardingRoutes.post(
  "/:sessionId/steps/verify_permissions",
  async (c) => {
    const sessionId = c.req.param("sessionId");

    try {
      const session = await getOnboardingSession(sessionId);
      if (!session?.organizationId) {
        return c.json({ error: "Organization not created yet" }, 400);
      }

      // In a real implementation, we would:
      // 1. Use the stored credentials to test each permission
      // 2. Call GCP APIs to verify access
      // For demo, we'll simulate success

      // Simulate permission verification
      const permissionResults: Record<string, boolean> = {};
      for (const perm of REQUIRED_GCP_PERMISSIONS) {
        permissionResults[perm] = true; // Simulated success
      }

      const allGranted = Object.values(permissionResults).every(v => v);

      // Update onboarding progress
      if (allGranted) {
        await updateOnboardingProgress(session.organizationId, {
          cloudConnected: true,
        });
      }

      const { nextStep } = await completeOnboardingStep(
        sessionId,
        OnboardingStep.VERIFY_PERMISSIONS,
        {
          verifyPermissions: {
            allPermissionsGranted: allGranted,
            permissionResults,
            errors: [],
          },
        }
      );

      return c.json({
        success: allGranted,
        nextStep: allGranted ? nextStep : null,
        permissionResults,
        errors: allGranted ? [] : ["Some permissions are missing"],
        progress: getStepProgress(nextStep || OnboardingStep.COMPLETE),
      });
    } catch (error) {
      log.error("Failed to verify permissions", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Discover GKE clusters.
 */
onboardingRoutes.post(
  "/:sessionId/steps/discover_clusters",
  async (c) => {
    const sessionId = c.req.param("sessionId");

    try {
      const session = await getOnboardingSession(sessionId);
      if (!session?.organizationId) {
        return c.json({ error: "Organization not created yet" }, 400);
      }

      // In a real implementation, we would:
      // 1. Use the GCP Container API to list clusters
      // 2. Check each cluster for GPU node pools
      // For demo, we'll return simulated clusters

      const discoveredClusters = [
        {
          name: "prod-cluster",
          location: "us-central1-a",
          gpuNodePools: [
            { name: "gpu-pool", gpuType: "nvidia-t4", totalGpus: 4 },
            { name: "ml-pool", gpuType: "nvidia-l4", totalGpus: 2 },
          ],
        },
        {
          name: "dev-cluster",
          location: "us-central1-b",
          gpuNodePools: [
            { name: "dev-gpu-pool", gpuType: "nvidia-t4", totalGpus: 2 },
          ],
        },
      ];

      const { nextStep } = await completeOnboardingStep(
        sessionId,
        OnboardingStep.DISCOVER_CLUSTERS,
        {
          discoverClusters: {
            discoveryCompleted: true,
            clustersFound: discoveredClusters,
          },
        }
      );

      return c.json({
        success: true,
        nextStep,
        clusters: discoveredClusters,
        progress: getStepProgress(nextStep || OnboardingStep.COMPLETE),
      });
    } catch (error) {
      log.error("Failed to discover clusters", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Select clusters to manage.
 */
onboardingRoutes.post(
  "/:sessionId/steps/select_clusters",
  zValidator("json", SelectClustersStepSchema),
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const data = c.req.valid("json");

    try {
      const session = await getOnboardingSession(sessionId);
      if (!session?.organizationId) {
        return c.json({ error: "Organization not created yet" }, 400);
      }

      // Get cloud connection
      const connections = await import("../../db/cloud-connections.js")
        .then(m => m.listCloudConnections(session.organizationId!));
      const connection = connections[0];

      if (!connection) {
        return c.json({ error: "No cloud connection found" }, 400);
      }

      // Create managed cluster records
      const discoveredClusters = session.stepData.discoverClusters?.clustersFound || [];
      const createdClusters = [];

      for (const clusterName of data.selectedClusterNames) {
        const clusterInfo = discoveredClusters.find((c: { name: string }) => c.name === clusterName);
        if (clusterInfo) {
          const cluster = await createManagedCluster({
            organizationId: session.organizationId!,
            cloudConnectionId: connection.id,
            name: clusterInfo.name,
            location: clusterInfo.location,
            clusterType: ClusterType.GKE_STANDARD,
          });
          createdClusters.push(cluster);
        }
      }

      const { nextStep } = await completeOnboardingStep(
        sessionId,
        OnboardingStep.SELECT_CLUSTERS,
        {
          selectClusters: {
            selectedClusterNames: data.selectedClusterNames,
          },
        }
      );

      return c.json({
        success: true,
        nextStep,
        clusters: createdClusters,
        progress: getStepProgress(nextStep || OnboardingStep.COMPLETE),
      });
    } catch (error) {
      log.error("Failed to select clusters", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Get agent install commands.
 */
onboardingRoutes.post(
  "/:sessionId/steps/install_agent",
  async (c) => {
    const sessionId = c.req.param("sessionId");

    try {
      const session = await getOnboardingSession(sessionId);
      if (!session?.organizationId) {
        return c.json({ error: "Organization not created yet" }, 400);
      }

      const apiEndpoint = `http://${config.api.host}:${config.api.port}`;
      const clusters = await import("../../db/cloud-connections.js")
        .then(m => m.listOrganizationClusters(session.organizationId!));

      const installCommands = clusters.map(cluster => ({
        clusterName: cluster.name,
        clusterId: cluster.id,
        kubectlCommand: getAgentInstallCommand(cluster.id, session.organizationId!, apiEndpoint),
        helmCommand: getHelmInstallCommand(cluster.id, session.organizationId!, apiEndpoint),
      }));

      const { nextStep } = await completeOnboardingStep(
        sessionId,
        OnboardingStep.INSTALL_AGENT,
        {
          installAgent: {
            installCommand: installCommands[0]?.kubectlCommand || "",
            helmCommand: installCommands[0]?.helmCommand || "",
            installMethod: "kubectl",
          },
        }
      );

      return c.json({
        success: true,
        nextStep,
        installCommands,
        progress: getStepProgress(nextStep || OnboardingStep.COMPLETE),
      });
    } catch (error) {
      log.error("Failed to get install commands", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Verify agent installation.
 */
onboardingRoutes.post(
  "/:sessionId/steps/verify_agent",
  async (c) => {
    const sessionId = c.req.param("sessionId");

    try {
      const session = await getOnboardingSession(sessionId);
      if (!session?.organizationId) {
        return c.json({ error: "Organization not created yet" }, 400);
      }

      const clusters = await import("../../db/cloud-connections.js")
        .then(m => m.listOrganizationClusters(session.organizationId!));

      // Check agent status for each cluster
      const agentStatuses: Record<string, { installed: boolean; healthy: boolean; version?: string }> = {};
      let allVerified = true;

      for (const cluster of clusters) {
        // In real implementation, we'd check the agent heartbeat
        // For demo, simulate some clusters having agents installed
        const isInstalled = Math.random() > 0.3; // 70% chance installed
        agentStatuses[cluster.id] = {
          installed: isInstalled,
          healthy: isInstalled,
          version: isInstalled ? "0.1.0" : undefined,
        };
        if (!isInstalled) allVerified = false;

        // Update cluster status
        if (isInstalled) {
          await updateClusterManagementStatus(cluster.id, ClusterManagementStatus.ACTIVE);
        }
      }

      // Update onboarding progress
      if (allVerified) {
        await updateOnboardingProgress(session.organizationId, {
          agentInstalled: true,
          firstGpuDiscovered: true,
        });
      }

      const { nextStep } = await completeOnboardingStep(
        sessionId,
        OnboardingStep.VERIFY_AGENT,
        {
          verifyAgent: {
            allAgentsVerified: allVerified,
            agentStatuses,
          },
        }
      );

      return c.json({
        success: allVerified,
        nextStep: allVerified ? nextStep : null,
        agentStatuses,
        allVerified,
        progress: getStepProgress(nextStep || OnboardingStep.COMPLETE),
      });
    } catch (error) {
      log.error("Failed to verify agents", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Configure harvesting rules.
 */
onboardingRoutes.post(
  "/:sessionId/steps/configure_rules",
  zValidator("json", ConfigureRulesStepSchema),
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const data = c.req.valid("json");

    try {
      const session = await getOnboardingSession(sessionId);
      if (!session?.organizationId) {
        return c.json({ error: "Organization not created yet" }, 400);
      }

      // Create rule set
      const ruleSet = await createRuleSet({
        organizationId: session.organizationId,
        name: "Default Rules",
        description: "Default harvesting rules created during onboarding",
        rules: data.useDefaultRules ? createDefaultRules() : [],
        isDefault: true,
        createdBy: session.email,
      });

      // Update onboarding progress
      await updateOnboardingProgress(session.organizationId, {
        rulesConfigured: true,
      });

      const { nextStep } = await completeOnboardingStep(
        sessionId,
        OnboardingStep.CONFIGURE_RULES,
        {
          configureRules: {
            useDefaultRules: data.useDefaultRules,
            customRulesCreated: data.customRules?.length || 0,
            ruleSetId: ruleSet.id,
          },
        }
      );

      return c.json({
        success: true,
        nextStep,
        ruleSetId: ruleSet.id,
        progress: getStepProgress(nextStep || OnboardingStep.COMPLETE),
      });
    } catch (error) {
      log.error("Failed to configure rules", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Generate API keys.
 */
onboardingRoutes.post(
  "/:sessionId/steps/generate_api_keys",
  zValidator("json", GenerateApiKeysStepSchema),
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const data = c.req.valid("json");

    try {
      const session = await getOnboardingSession(sessionId);
      if (!session?.organizationId) {
        return c.json({ error: "Organization not created yet" }, 400);
      }

      const org = await getOrganization(session.organizationId);
      if (!org) {
        return c.json({ error: "Organization not found" }, 404);
      }

      // Create tenant for API access
      const tenant = await createTenant({
        name: org.name,
        email: org.billingEmail,
        tier: TenantTier.FREE,
      });

      // Generate API key
      const { key, apiKey } = await createApiKey(tenant.id, {
        name: data.keyName,
      });

      // Activate organization
      await activateOrganization(session.organizationId);

      const { nextStep } = await completeOnboardingStep(
        sessionId,
        OnboardingStep.GENERATE_API_KEYS,
        {
          generateApiKeys: {
            apiKeyGenerated: true,
            apiKeyId: apiKey.id,
            apiKeyPrefix: apiKey.keyPrefix,
          },
        }
      );

      return c.json({
        success: true,
        nextStep,
        apiKey: {
          id: apiKey.id,
          key, // Only shown once!
          name: apiKey.name,
          prefix: apiKey.keyPrefix,
        },
        tenantId: tenant.id,
        message: "Save your API key - it won't be shown again!",
        progress: getStepProgress(nextStep || OnboardingStep.COMPLETE),
      });
    } catch (error) {
      log.error("Failed to generate API key", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Skip a step (if allowed).
 */
onboardingRoutes.post("/:sessionId/steps/:stepName/skip", async (c) => {
  const sessionId = c.req.param("sessionId");
  const stepName = c.req.param("stepName") as OnboardingStep;

  try {
    if (!canSkipStep(stepName)) {
      return c.json({ error: "This step cannot be skipped" }, 400);
    }

    const { nextStep, session } = await skipOnboardingStep(sessionId, stepName);

    return c.json({
      success: true,
      nextStep,
      progress: getStepProgress(nextStep || OnboardingStep.COMPLETE),
    });
  } catch (error) {
    log.error("Failed to skip step", { error: (error as Error).message });
    return c.json({ error: (error as Error).message }, 500);
  }
});

// ============================================================================
// Utility Endpoints
// ============================================================================

/**
 * Get all step configurations.
 */
onboardingRoutes.get("/config/steps", (c) => {
  return c.json({
    steps: Object.values(STEP_CONFIGS),
    requiredPermissions: REQUIRED_GCP_PERMISSIONS,
  });
});
