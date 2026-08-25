/**
 * Onboarding wizard page - matching landing page design.
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X, ArrowUpRight } from 'lucide-react';

import { useOnboarding } from '../hooks/use-onboarding';
import { StepProgress } from '../components/onboarding/step-progress';
import { WelcomeStep } from '../components/onboarding/steps/welcome-step';
import { OrganizationStep } from '../components/onboarding/steps/organization-step';
import { DeploymentStep } from '../components/onboarding/steps/deployment-step';
import { ConnectCloudStep } from '../components/onboarding/steps/connect-cloud-step';
import { VerifyPermissionsStep } from '../components/onboarding/steps/verify-permissions-step';
import { ClusterSelectionStep } from '../components/onboarding/steps/cluster-selection-step';
import { InstallAgentStep } from '../components/onboarding/steps/install-agent-step';
import { ApiKeysStep } from '../components/onboarding/steps/api-keys-step';
import { CompleteStep } from '../components/onboarding/steps/complete-step';

export function OnboardingPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [showEmailInput, setShowEmailInput] = useState(true);

  const {
    sessionId,
    currentStep,
    completedSteps,
    skippedSteps,
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
    goToStep,
    clearSession,
  } = useOnboarding();

  // Try to resume existing session on mount
  useEffect(() => {
    const tryResume = async () => {
      const resumed = await resumeSession();
      if (resumed) {
        setShowEmailInput(false);
      }
    };
    tryResume();
  }, []);

  // Check for email in URL params
  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    try {
      await startSession(email, 'web');
      setShowEmailInput(false);
    } catch (err) {
      // Error is handled by the hook
    }
  };

  const handleRestartOnboarding = () => {
    clearSession();
    setShowEmailInput(true);
    setEmail('');
  };

  // Animation variants
  const stepVariants = {
    enter: { opacity: 0, y: 20 },
    center: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] relative overflow-hidden">
      {/* Gradient orb effects */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] opacity-40 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-radial from-orange-500/30 via-orange-600/10 to-transparent blur-3xl" />
      </div>
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] opacity-30 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-radial from-amber-500/20 via-red-500/5 to-transparent blur-2xl" />
      </div>

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center">
              <span className="text-white font-bold">X</span>
            </div>
            <span className="font-semibold text-white">Xid-R</span>
            <span className="text-white/30">|</span>
            <span className="text-white/50 text-sm">Setup Wizard</span>
          </a>

          {sessionId && !isComplete && (
            <button
              onClick={handleRestartOnboarding}
              className="text-sm text-white/50 hover:text-white/80 transition-colors"
            >
              Start Over
            </button>
          )}
        </div>
      </header>

      {/* Progress Bar */}
      {sessionId && !showEmailInput && (
        <div className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-6 py-6">
            <StepProgress
              currentStep={currentStep}
              completedSteps={completedSteps}
              skippedSteps={skippedSteps}
              onStepClick={goToStep}
            />
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
            <button className="text-red-400 hover:text-red-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {/* Email Input */}
          {showEmailInput && (
            <motion.div
              key="email-input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              className="max-w-md mx-auto text-center pt-12"
            >
              {/* Badge */}
              <div className="mb-6 inline-flex items-center gap-3 rounded-full bg-white/5 px-2.5 py-2 ring-1 ring-white/10 backdrop-blur">
                <span className="inline-flex items-center text-xs font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-full py-0.5 px-2 font-sans">
                  Setup
                </span>
                <span className="text-sm font-medium text-white/80 font-sans">
                  Enterprise Onboarding
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl text-white tracking-tight font-serif font-normal italic mb-4">
                Welcome to{' '}
                <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500 bg-clip-text text-transparent">
                  Xid-R
                </span>
              </h1>
              <p className="text-white/60 mb-10 text-lg leading-relaxed">
                Enter your email to get started or resume your previous session
              </p>

              <form onSubmit={handleStartSession} className="space-y-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 backdrop-blur transition-all"
                  required
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 rounded-xl py-4 px-6 font-sans transition-all shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)] disabled:opacity-50"
                >
                  {loading ? 'Starting...' : 'Get Started'}
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </form>

              <p className="mt-8 text-xs text-white/40">
                By continuing, you agree to our Terms of Service and Privacy Policy
              </p>
            </motion.div>
          )}

          {/* Welcome Step */}
          {!showEmailInput && currentStep === 'welcome' && (
            <motion.div
              key="welcome"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              <WelcomeStep onContinue={submitWelcome} loading={loading} />
            </motion.div>
          )}

          {/* Organization Step */}
          {!showEmailInput && currentStep === 'organization_details' && (
            <motion.div
              key="organization"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              <OrganizationStep
                onContinue={submitOrganization}
                onBack={() => goToStep('welcome')}
                loading={loading}
                initialEmail={email}
              />
            </motion.div>
          )}

          {/* Deployment Step */}
          {!showEmailInput && currentStep === 'deployment_model' && (
            <motion.div
              key="deployment"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              <DeploymentStep
                onContinue={submitDeploymentModel}
                onBack={() => goToStep('organization_details')}
                loading={loading}
              />
            </motion.div>
          )}

          {/* Connect Cloud Step */}
          {!showEmailInput && currentStep === 'connect_cloud' && (
            <motion.div
              key="connect_cloud"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              <ConnectCloudStep
                onContinue={submitCloudConnection}
                onBack={() => goToStep('deployment_model')}
                loading={loading}
              />
            </motion.div>
          )}

          {/* Verify Permissions Step */}
          {!showEmailInput && currentStep === 'verify_permissions' && (
            <motion.div
              key="verify_permissions"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              <VerifyPermissionsStep
                onVerify={verifyPermissions}
                onContinue={() => {}}
                onBack={() => goToStep('connect_cloud')}
                loading={loading}
              />
            </motion.div>
          )}

          {/* Discover Clusters Step */}
          {!showEmailInput && (currentStep === 'discover_clusters' || currentStep === 'select_clusters') && (
            <motion.div
              key="cluster_selection"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              <ClusterSelectionStep
                onDiscover={discoverClusters}
                onContinue={selectClusters}
                onBack={() => goToStep('verify_permissions')}
                loading={loading}
              />
            </motion.div>
          )}

          {/* Install Agent Step */}
          {!showEmailInput && currentStep === 'install_agent' && (
            <motion.div
              key="install_agent"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              <InstallAgentStep
                onGetCommands={getInstallCommands}
                onContinue={async () => {
                  await verifyAgents();
                }}
                onBack={() => goToStep('select_clusters')}
                loading={loading}
              />
            </motion.div>
          )}

          {/* Verify Agent Step */}
          {!showEmailInput && currentStep === 'verify_agent' && (
            <motion.div
              key="verify_agent"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              <div className="max-w-xl mx-auto text-center py-12">
                <h2 className="text-3xl text-white font-serif italic mb-4">
                  Verifying Agent{' '}
                  <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
                    Installation
                  </span>
                </h2>
                <p className="text-white/60 mb-8">
                  Checking connectivity with your cluster agents
                </p>
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-r from-orange-500/20 to-amber-500/20 animate-pulse" />
                </div>
              </div>
            </motion.div>
          )}

          {/* Configure Rules Step */}
          {!showEmailInput && currentStep === 'configure_rules' && (
            <motion.div
              key="configure_rules"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              <div className="max-w-xl mx-auto">
                <div className="text-center mb-8">
                  <h2 className="text-3xl text-white font-serif italic mb-2">
                    Configure{' '}
                    <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
                      Harvesting Rules
                    </span>
                  </h2>
                  <p className="text-white/60">Set up automatic approval policies</p>
                </div>

                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur mb-6">
                  <h3 className="font-medium text-white mb-4 font-sans">Default Rules</h3>
                  <ul className="space-y-3 text-sm text-white/70">
                    <li className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      Auto-approve dev/test pools during business hours
                    </li>
                    <li className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      Require approval for high-value A100 GPUs
                    </li>
                    <li className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-orange-400" />
                      Manual approval for all other requests
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => configureRules(true)}
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 rounded-xl py-4 px-6 font-sans transition-all shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)] disabled:opacity-50"
                >
                  {loading ? 'Configuring...' : 'Use Default Rules & Continue'}
                </button>

                <p className="text-center text-xs text-white/40 mt-4">
                  You can customize rules later in the dashboard
                </p>
              </div>
            </motion.div>
          )}

          {/* Generate API Keys Step */}
          {!showEmailInput && currentStep === 'generate_api_keys' && (
            <motion.div
              key="generate_api_keys"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              <ApiKeysStep
                onGenerate={generateApiKey}
                onContinue={() => {}}
                onBack={() => goToStep('configure_rules')}
                loading={loading}
              />
            </motion.div>
          )}

          {/* Complete Step */}
          {!showEmailInput && currentStep === 'complete' && (
            <motion.div
              key="complete"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              <CompleteStep />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 mt-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between text-sm text-white/40">
          <span>&copy; 2026 Xid-R. All rights reserved.</span>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-white/70 transition-colors">Help</a>
            <a href="#" className="hover:text-white/70 transition-colors">Privacy</a>
            <a href="#" className="hover:text-white/70 transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default OnboardingPage;
