/**
 * Onboarding wizard state management hook.
 */

import { useState, useCallback, useEffect } from 'react';
import api, {
  OnboardingStep,
  OnboardingStepConfig,
  DiscoveredCluster,
  InstallCommand,
  AgentStatus,
} from '../lib/api';

const RESUME_TOKEN_KEY = 'xidr_onboarding_token';

interface OnboardingState {
  sessionId: string | null;
  resumeToken: string | null;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  skippedSteps: OnboardingStep[];
  organizationId: string | null;
  stepData: Record<string, unknown>;
  progress: number;
  canSkip: boolean;
  stepConfigs: OnboardingStepConfig[];
}

interface OnboardingActions {
  // Session management
  startSession: (email: string, source?: string) => Promise<void>;
  resumeSession: () => Promise<boolean>;

  // Step submissions
  submitWelcome: () => Promise<void>;
  submitOrganization: (data: {
    name: string;
    domain?: string;
    billingEmail: string;
    plan?: 'free' | 'pro' | 'enterprise';
  }) => Promise<void>;
  submitDeploymentModel: (model: 'saas' | 'hybrid' | 'self_hosted') => Promise<void>;
  submitCloudConnection: (data: {
    projectId: string;
    connectionMethod: 'service_account' | 'workload_identity';
    serviceAccountEmail?: string;
    credentials?: string;
  }) => Promise<void>;
  verifyPermissions: () => Promise<{ results: Record<string, boolean>; errors: string[] }>;
  discoverClusters: () => Promise<DiscoveredCluster[]>;
  selectClusters: (clusterNames: string[]) => Promise<void>;
  getInstallCommands: () => Promise<InstallCommand[]>;
  verifyAgents: () => Promise<{ statuses: Record<string, AgentStatus>; allVerified: boolean }>;
  configureRules: (useDefaults: boolean, customRules?: unknown[]) => Promise<void>;
  generateApiKey: (keyName: string) => Promise<{ key: string; id: string }>;

  // Navigation
  skipStep: () => Promise<void>;
  goToStep: (step: OnboardingStep) => void;

  // Utilities
  clearSession: () => void;
  refresh: () => Promise<void>;
}

export interface UseOnboardingReturn extends OnboardingState, OnboardingActions {
  loading: boolean;
  error: string | null;
  isComplete: boolean;
}

const STEP_ORDER: OnboardingStep[] = [
  'welcome',
  'organization_details',
  'deployment_model',
  'connect_cloud',
  'verify_permissions',
  'discover_clusters',
  'select_clusters',
  'install_agent',
  'verify_agent',
  'configure_rules',
  'generate_api_keys',
  'complete',
];

const initialState: OnboardingState = {
  sessionId: null,
  resumeToken: null,
  currentStep: 'welcome',
  completedSteps: [],
  skippedSteps: [],
  organizationId: null,
  stepData: {},
  progress: 0,
  canSkip: false,
  stepConfigs: [],
};

export function useOnboarding(): UseOnboardingReturn {
  const [state, setState] = useState<OnboardingState>(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load step configs on mount
  useEffect(() => {
    api.getOnboardingStepConfigs()
      .then(({ steps }) => {
        setState(prev => ({ ...prev, stepConfigs: steps }));
      })
      .catch(console.error);
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    const token = localStorage.getItem(RESUME_TOKEN_KEY);
    if (token) {
      setState(prev => ({ ...prev, resumeToken: token }));
    }
  }, []);

  const updateStateFromResponse = useCallback((response: {
    nextStep?: OnboardingStep | null;
    progress?: number;
    [key: string]: unknown;
  }) => {
    if (response.nextStep) {
      setState(prev => ({
        ...prev,
        currentStep: response.nextStep!,
        completedSteps: [...prev.completedSteps, prev.currentStep],
        progress: response.progress ?? prev.progress,
      }));
    }
  }, []);

  const startSession = useCallback(async (email: string, source?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.startOnboarding(email, source);
      localStorage.setItem(RESUME_TOKEN_KEY, response.resumeToken);
      setState(prev => ({
        ...prev,
        sessionId: response.sessionId,
        resumeToken: response.resumeToken,
        currentStep: response.currentStep,
      }));
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const resumeSession = useCallback(async (): Promise<boolean> => {
    const token = localStorage.getItem(RESUME_TOKEN_KEY);
    if (!token) return false;

    setLoading(true);
    setError(null);
    try {
      const response = await api.resumeOnboarding(token);
      setState(prev => ({
        ...prev,
        sessionId: response.sessionId,
        resumeToken: token,
        currentStep: response.currentStep,
        completedSteps: response.completedSteps,
        stepData: response.stepData,
        progress: response.progress,
      }));
      return true;
    } catch (err) {
      // Token invalid, clear it
      localStorage.removeItem(RESUME_TOKEN_KEY);
      setState(prev => ({ ...prev, resumeToken: null }));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!state.sessionId) return;

    setLoading(true);
    try {
      const response = await api.getOnboardingSession(state.sessionId);
      setState(prev => ({
        ...prev,
        currentStep: response.session.currentStep,
        completedSteps: response.session.completedSteps,
        skippedSteps: response.session.skippedSteps,
        organizationId: response.session.organizationId ?? null,
        stepData: response.session.stepData,
        progress: response.progress,
        canSkip: response.canSkip,
      }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [state.sessionId]);

  const submitWelcome = useCallback(async () => {
    if (!state.sessionId) throw new Error('No session');
    setLoading(true);
    setError(null);
    try {
      const response = await api.submitWelcomeStep(state.sessionId, { acknowledged: true });
      updateStateFromResponse(response);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [state.sessionId, updateStateFromResponse]);

  const submitOrganization = useCallback(async (data: {
    name: string;
    domain?: string;
    billingEmail: string;
    plan?: 'free' | 'pro' | 'enterprise';
  }) => {
    if (!state.sessionId) throw new Error('No session');
    setLoading(true);
    setError(null);
    try {
      const response = await api.submitOrganizationStep(state.sessionId, data);
      setState(prev => ({ ...prev, organizationId: response.organizationId }));
      updateStateFromResponse(response);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [state.sessionId, updateStateFromResponse]);

  const submitDeploymentModel = useCallback(async (model: 'saas' | 'hybrid' | 'self_hosted') => {
    if (!state.sessionId) throw new Error('No session');
    setLoading(true);
    setError(null);
    try {
      const response = await api.submitDeploymentModelStep(state.sessionId, { deploymentModel: model });
      updateStateFromResponse(response);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [state.sessionId, updateStateFromResponse]);

  const submitCloudConnection = useCallback(async (data: {
    projectId: string;
    connectionMethod: 'service_account' | 'workload_identity';
    serviceAccountEmail?: string;
    credentials?: string;
  }) => {
    if (!state.sessionId) throw new Error('No session');
    setLoading(true);
    setError(null);
    try {
      const response = await api.submitConnectCloudStep(state.sessionId, data);
      updateStateFromResponse(response);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [state.sessionId, updateStateFromResponse]);

  const verifyPermissions = useCallback(async () => {
    if (!state.sessionId) throw new Error('No session');
    setLoading(true);
    setError(null);
    try {
      const response = await api.verifyPermissions(state.sessionId);
      if (response.success) {
        updateStateFromResponse(response);
      }
      return { results: response.permissionResults, errors: response.errors };
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [state.sessionId, updateStateFromResponse]);

  const discoverClusters = useCallback(async () => {
    if (!state.sessionId) throw new Error('No session');
    setLoading(true);
    setError(null);
    try {
      const response = await api.discoverClusters(state.sessionId);
      updateStateFromResponse(response);
      return response.clusters;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [state.sessionId, updateStateFromResponse]);

  const selectClusters = useCallback(async (clusterNames: string[]) => {
    if (!state.sessionId) throw new Error('No session');
    setLoading(true);
    setError(null);
    try {
      const response = await api.selectClusters(state.sessionId, { selectedClusterNames: clusterNames });
      updateStateFromResponse(response);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [state.sessionId, updateStateFromResponse]);

  const getInstallCommands = useCallback(async () => {
    if (!state.sessionId) throw new Error('No session');
    setLoading(true);
    setError(null);
    try {
      const response = await api.getInstallCommands(state.sessionId);
      updateStateFromResponse(response);
      return response.installCommands;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [state.sessionId, updateStateFromResponse]);

  const verifyAgents = useCallback(async () => {
    if (!state.sessionId) throw new Error('No session');
    setLoading(true);
    setError(null);
    try {
      const response = await api.verifyAgents(state.sessionId);
      if (response.success) {
        updateStateFromResponse(response);
      }
      return { statuses: response.agentStatuses, allVerified: response.allVerified };
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [state.sessionId, updateStateFromResponse]);

  const configureRules = useCallback(async (useDefaults: boolean, customRules?: unknown[]) => {
    if (!state.sessionId) throw new Error('No session');
    setLoading(true);
    setError(null);
    try {
      const response = await api.configureRules(state.sessionId, { useDefaultRules: useDefaults, customRules });
      updateStateFromResponse(response);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [state.sessionId, updateStateFromResponse]);

  const generateApiKey = useCallback(async (keyName: string) => {
    if (!state.sessionId) throw new Error('No session');
    setLoading(true);
    setError(null);
    try {
      const response = await api.generateApiKeys(state.sessionId, { keyName });
      updateStateFromResponse(response);
      return { key: response.apiKey.key, id: response.apiKey.id };
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [state.sessionId, updateStateFromResponse]);

  const skipStep = useCallback(async () => {
    if (!state.sessionId) throw new Error('No session');
    setLoading(true);
    setError(null);
    try {
      const response = await api.skipOnboardingStep(state.sessionId, state.currentStep);
      setState(prev => ({
        ...prev,
        currentStep: response.nextStep!,
        skippedSteps: [...prev.skippedSteps, prev.currentStep],
        progress: response.progress,
      }));
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [state.sessionId, state.currentStep]);

  const goToStep = useCallback((step: OnboardingStep) => {
    const currentIndex = STEP_ORDER.indexOf(state.currentStep);
    const targetIndex = STEP_ORDER.indexOf(step);

    // Can only go back to completed/skipped steps
    if (targetIndex < currentIndex) {
      setState(prev => ({ ...prev, currentStep: step }));
    }
  }, [state.currentStep]);

  const clearSession = useCallback(() => {
    localStorage.removeItem(RESUME_TOKEN_KEY);
    setState(initialState);
    setError(null);
  }, []);

  const isComplete = state.currentStep === 'complete';

  return {
    ...state,
    loading,
    error,
    isComplete,
    startSession,
    resumeSession,
    submitWelcome,
    submitOrganization,
    submitDeploymentModel,
    submitCloudConnection,
    verifyPermissions,
    discoverClusters,
    selectClusters,
    getInstallCommands,
    verifyAgents,
    configureRules,
    generateApiKey,
    skipStep,
    goToStep,
    clearSession,
    refresh,
  };
}

export default useOnboarding;
