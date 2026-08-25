/**
 * Configure harvesting rules step - matching landing page design.
 */

import { useState } from 'react';
import { Settings, Zap, Shield, Clock, ArrowRight, ArrowLeft, Check, AlertCircle } from 'lucide-react';

interface ConfigureRulesStepProps {
  onContinue: (data: { useDefaults: boolean; customRules?: unknown[] }) => void;
  onBack?: () => void;
  loading?: boolean;
}

interface RulePreset {
  id: string;
  name: string;
  description: string;
  icon: typeof Zap;
  features: string[];
  recommended?: boolean;
}

const RULE_PRESETS: RulePreset[] = [
  {
    id: 'conservative',
    name: 'Conservative',
    description: 'Require manual approval for all harvesting requests',
    icon: Shield,
    features: [
      'All requests require manual approval',
      'Email notifications for each request',
      'Full audit trail',
      'Maximum control over GPU allocation',
    ],
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Auto-approve dev/test, require approval for production',
    icon: Settings,
    features: [
      'Auto-approve for dev/test node pools',
      'Manual approval for production GPUs',
      'Auto-approve low-value GPUs (T4, L4)',
      'Business hours optimization',
    ],
    recommended: true,
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'Maximize GPU utilization with minimal oversight',
    icon: Zap,
    features: [
      'Auto-approve most requests',
      'Quick auto-approval timeout (15 min)',
      'Only high-value A100s require approval',
      'Maximum cost savings potential',
    ],
  },
];

const DEFAULT_RULES = [
  {
    name: 'Dev/Test Auto-Approve',
    description: 'Auto-approve for dev and test environments during business hours',
    action: 'auto_approve',
    conditions: ['Dev/test node pools', 'Business hours (9AM-6PM)'],
  },
  {
    name: 'A100 Manual Approval',
    description: 'Require approval for high-value A100 GPUs',
    action: 'require_approval',
    conditions: ['A100-40GB and A100-80GB GPUs', 'Auto-approve after 30 minutes'],
  },
  {
    name: 'Default Manual',
    description: 'Fallback rule requiring approval',
    action: 'require_approval',
    conditions: ['All other GPUs', 'Standard approval workflow'],
  },
];

export function ConfigureRulesStep({ onContinue, onBack, loading }: ConfigureRulesStepProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>('balanced');
  const [showDetails, setShowDetails] = useState(false);

  const handleContinue = () => {
    onContinue({ useDefaults: true });
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 mb-4">
          <Settings className="w-8 h-8 text-orange-400" />
        </div>
        <h2 className="text-3xl text-white font-serif italic mb-2">
          Configure{' '}
          <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
            Harvesting Rules
          </span>
        </h2>
        <p className="text-white/60">Choose how Xid-R should handle GPU harvesting requests</p>
      </div>

      {/* Preset Selection */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {RULE_PRESETS.map((preset) => {
          const Icon = preset.icon;
          const isSelected = selectedPreset === preset.id;

          return (
            <button
              key={preset.id}
              onClick={() => setSelectedPreset(preset.id)}
              className={`relative p-6 rounded-2xl border text-left transition-all backdrop-blur ${
                isSelected
                  ? 'border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/20'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              {/* Recommended badge */}
              {preset.recommended && (
                <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-gradient-to-r from-orange-500 to-amber-500 text-xs font-medium text-white rounded-full font-sans">
                  Recommended
                </div>
              )}

              {/* Selection indicator */}
              <div
                className={`absolute top-4 right-4 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                  isSelected
                    ? 'border-orange-500 bg-gradient-to-r from-orange-500 to-amber-500'
                    : 'border-white/30'
                }`}
              >
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </div>

              {/* Icon */}
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                  isSelected ? 'bg-orange-500/20' : 'bg-white/10'
                }`}
              >
                <Icon className={`w-6 h-6 ${isSelected ? 'text-orange-400' : 'text-white/60'}`} />
              </div>

              {/* Title & Description */}
              <h3 className={`font-semibold mb-2 font-sans ${isSelected ? 'text-white' : 'text-white/80'}`}>
                {preset.name}
              </h3>
              <p className="text-sm text-white/50 mb-4">{preset.description}</p>

              {/* Features */}
              <ul className="space-y-2">
                {preset.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-white/60">
                    <Check className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* Show Details Toggle */}
      <div className="mb-6">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-orange-400 hover:text-orange-300 font-sans transition-colors"
        >
          {showDetails ? 'Hide' : 'Show'} default rules →
        </button>
      </div>

      {/* Default Rules Preview */}
      {showDetails && (
        <div className="space-y-3 mb-8">
          {DEFAULT_RULES.map((rule, index) => (
            <div
              key={index}
              className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-white font-sans">{rule.name}</h4>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        rule.action === 'auto_approve'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {rule.action === 'auto_approve' ? 'Auto-Approve' : 'Manual Approval'}
                    </span>
                  </div>
                  <p className="text-sm text-white/50 mb-2">{rule.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {rule.conditions.map((condition, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white/60"
                      >
                        {condition}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur mb-8">
        <div className="flex gap-3">
          <Clock className="w-5 h-5 text-orange-400 flex-shrink-0" />
          <div className="text-sm text-white/60">
            <p className="font-medium text-white/80 mb-1 font-sans">Rules can be customized later</p>
            <p>
              You can modify these rules anytime from the dashboard. Add time-based rules,
              GPU-specific policies, or integrate with your existing approval workflows.
            </p>
          </div>
        </div>
      </div>

      {/* Warning for aggressive preset */}
      {selectedPreset === 'aggressive' && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 backdrop-blur mb-8">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-300 font-sans">Aggressive mode</p>
              <p className="text-amber-200/70 mt-1">
                This preset minimizes approval requirements to maximize GPU utilization.
                Ensure your team is comfortable with automated harvesting decisions.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        {onBack ? (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white transition-colors font-sans"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        ) : (
          <div />
        )}
        <button
          onClick={handleContinue}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 rounded-full py-3 px-6 font-sans transition-all shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)] disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Continue'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default ConfigureRulesStep;
