/**
 * Deployment model selection step - matching landing page design.
 */

import { useState } from 'react';
import { Cloud, Server, Layers, ArrowRight, ArrowLeft, Check } from 'lucide-react';

type DeploymentModel = 'saas' | 'hybrid' | 'self_hosted';

interface DeploymentStepProps {
  onContinue: (model: DeploymentModel) => void;
  onBack?: () => void;
  loading?: boolean;
}

const MODELS: Array<{
  id: DeploymentModel;
  title: string;
  description: string;
  features: string[];
  icon: typeof Cloud;
  recommended?: boolean;
}> = [
  {
    id: 'saas',
    title: 'SaaS',
    description: 'Fully managed by Xid-R. Minimal setup required.',
    features: [
      'Zero infrastructure management',
      'Automatic updates and scaling',
      'Agent runs in your cluster',
      'Dashboard hosted by Xid-R',
    ],
    icon: Cloud,
    recommended: true,
  },
  {
    id: 'hybrid',
    title: 'Hybrid',
    description: 'Control plane in cloud, data plane in your environment.',
    features: [
      'Control plane managed by Xid-R',
      'All data stays in your network',
      'Agent runs in your cluster',
      'Dashboard accessible via your network',
    ],
    icon: Layers,
  },
  {
    id: 'self_hosted',
    title: 'Self-Hosted',
    description: 'Full deployment in your environment.',
    features: [
      'Complete control over infrastructure',
      'Air-gapped deployment support',
      'All components in your network',
      'Manual updates required',
    ],
    icon: Server,
  },
];

export function DeploymentStep({ onContinue, onBack, loading }: DeploymentStepProps) {
  const [selected, setSelected] = useState<DeploymentModel>('saas');

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl text-white font-serif italic mb-2">
          Choose{' '}
          <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
            Deployment Model
          </span>
        </h2>
        <p className="text-white/60">Select how you want to deploy Xid-R</p>
      </div>

      {/* Model Cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {MODELS.map((model) => {
          const Icon = model.icon;
          const isSelected = selected === model.id;

          return (
            <button
              key={model.id}
              onClick={() => setSelected(model.id)}
              className={`relative p-6 rounded-2xl border text-left transition-all ${
                isSelected
                  ? 'border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/20'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              {/* Recommended badge */}
              {model.recommended && (
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
                {model.title}
              </h3>
              <p className="text-sm text-white/50 mb-4">{model.description}</p>

              {/* Features */}
              <ul className="space-y-2">
                {model.features.map((feature, i) => (
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

      {/* Info Box */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur mb-8">
        <p className="text-sm text-white/60">
          <strong className="text-white/80 font-sans">Note:</strong> All deployment models use the same agent-based architecture.
          The Xid-R agent runs inside your Kubernetes cluster and never sends your credentials outside your network.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
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
          onClick={() => onContinue(selected)}
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

export default DeploymentStep;
