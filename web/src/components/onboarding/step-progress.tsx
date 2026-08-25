/**
 * Onboarding step progress indicator - matching landing page design.
 */

import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { OnboardingStep } from '../../lib/api';

interface StepInfo {
  id: OnboardingStep;
  title: string;
  shortTitle: string;
}

const STEPS: StepInfo[] = [
  { id: 'welcome', title: 'Welcome', shortTitle: 'Start' },
  { id: 'organization_details', title: 'Organization', shortTitle: 'Org' },
  { id: 'deployment_model', title: 'Deployment', shortTitle: 'Deploy' },
  { id: 'connect_cloud', title: 'Cloud Connection', shortTitle: 'Cloud' },
  { id: 'verify_permissions', title: 'Permissions', shortTitle: 'Perms' },
  { id: 'discover_clusters', title: 'Discover', shortTitle: 'Find' },
  { id: 'select_clusters', title: 'Select Clusters', shortTitle: 'Select' },
  { id: 'install_agent', title: 'Install Agent', shortTitle: 'Agent' },
  { id: 'verify_agent', title: 'Verify Agent', shortTitle: 'Verify' },
  { id: 'configure_rules', title: 'Rules', shortTitle: 'Rules' },
  { id: 'generate_api_keys', title: 'API Keys', shortTitle: 'Keys' },
  { id: 'complete', title: 'Complete', shortTitle: 'Done' },
];

interface StepProgressProps {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  skippedSteps: OnboardingStep[];
  onStepClick?: (step: OnboardingStep) => void;
}

export function StepProgress({
  currentStep,
  completedSteps,
  skippedSteps,
  onStepClick,
}: StepProgressProps) {
  const currentIndex = STEPS.findIndex(s => s.id === currentStep);

  return (
    <div className="w-full">
      {/* Desktop: Full steps */}
      <div className="hidden lg:block">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => {
            const isCompleted = completedSteps.includes(step.id);
            const isSkipped = skippedSteps.includes(step.id);
            const isCurrent = step.id === currentStep;
            const isPast = index < currentIndex;
            const canClick = isPast || isCompleted || isSkipped;

            return (
              <div key={step.id} className="flex-1 relative">
                {/* Connector line */}
                {index > 0 && (
                  <div
                    className={cn(
                      'absolute top-4 -left-1/2 w-full h-0.5',
                      isPast || isCompleted
                        ? 'bg-gradient-to-r from-orange-500 to-amber-500'
                        : 'bg-white/10'
                    )}
                  />
                )}

                {/* Step circle and label */}
                <div className="relative flex flex-col items-center">
                  <button
                    onClick={() => canClick && onStepClick?.(step.id)}
                    disabled={!canClick}
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium z-10 transition-all border',
                      isCompleted && 'bg-gradient-to-r from-orange-500 to-amber-500 border-orange-500 text-white',
                      isSkipped && 'bg-amber-500/20 text-amber-400 border-amber-500/50',
                      isCurrent && 'bg-orange-500/20 text-orange-400 border-orange-500 ring-4 ring-orange-500/20',
                      !isCompleted && !isSkipped && !isCurrent && 'bg-white/5 text-white/50 border-white/20',
                      canClick && !isCurrent && 'cursor-pointer hover:ring-2 hover:ring-orange-500/30'
                    )}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <span className="text-xs">{index + 1}</span>
                    )}
                  </button>
                  <span
                    className={cn(
                      'mt-2 text-xs font-medium text-center max-w-[80px] leading-tight font-sans',
                      isCurrent ? 'text-orange-400' : 'text-white/50'
                    )}
                  >
                    {step.shortTitle}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: Compact progress */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-white/80 font-sans">
            Step {currentIndex + 1} of {STEPS.length}
          </span>
          <span className="text-sm text-orange-400 font-sans">
            {STEPS[currentIndex]?.title}
          </span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
          <div
            className="bg-gradient-to-r from-orange-500 to-amber-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${((currentIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-white/40">Start</span>
          <span className="text-xs text-white/40">Complete</span>
        </div>
      </div>
    </div>
  );
}

export function StepProgressCompact({
  currentStep,
  completedSteps,
}: Pick<StepProgressProps, 'currentStep' | 'completedSteps'>) {
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((step) => {
        const isCompleted = completedSteps.includes(step.id);
        const isCurrent = step.id === currentStep;

        return (
          <div
            key={step.id}
            className={cn(
              'w-2 h-2 rounded-full transition-all',
              isCompleted && 'bg-gradient-to-r from-orange-500 to-amber-500',
              isCurrent && 'bg-orange-400 ring-2 ring-orange-500/30',
              !isCompleted && !isCurrent && 'bg-white/20'
            )}
          />
        );
      })}
    </div>
  );
}

export default StepProgress;
