/**
 * Welcome step - matching landing page design.
 */

import { Rocket, Zap, Shield, ArrowRight } from 'lucide-react';

interface WelcomeStepProps {
  onContinue: () => void;
  loading?: boolean;
}

export function WelcomeStep({ onContinue, loading }: WelcomeStepProps) {
  return (
    <div className="max-w-2xl mx-auto text-center">
      {/* Hero */}
      <div className="mb-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 mb-6">
          <Rocket className="w-10 h-10 text-orange-400" />
        </div>
        <h1 className="text-4xl sm:text-5xl text-white tracking-tight font-serif font-normal italic mb-4">
          Welcome to{' '}
          <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500 bg-clip-text text-transparent">
            Xid-R
          </span>
        </h1>
        <p className="text-lg text-white/60 max-w-xl mx-auto leading-relaxed">
          The intelligent GPU compute broker that harvests idle capacity and optimizes your AI infrastructure costs.
        </p>
      </div>

      {/* Features */}
      <div className="grid md:grid-cols-3 gap-4 mb-10">
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-4 mx-auto">
            <Zap className="w-6 h-6 text-orange-400" />
          </div>
          <h3 className="font-semibold text-white mb-2 font-sans">Harvest Idle GPUs</h3>
          <p className="text-sm text-white/50">
            Automatically detect and reclaim underutilized GPU capacity across your clusters.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4 mx-auto">
            <Shield className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="font-semibold text-white mb-2 font-sans">Secure Agent Model</h3>
          <p className="text-sm text-white/50">
            Credentials stay in your cluster. Our agent runs locally with zero credential storage.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4 mx-auto">
            <Rocket className="w-6 h-6 text-amber-400" />
          </div>
          <h3 className="font-semibold text-white mb-2 font-sans">Checkpoint & Resume</h3>
          <p className="text-sm text-white/50">
            Graceful preemption with state preservation ensures your workloads never lose progress.
          </p>
        </div>
      </div>

      {/* What to expect */}
      <div className="text-left p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur mb-8">
        <h3 className="font-semibold text-white mb-4 font-sans">What to expect in this setup:</h3>
        <ul className="space-y-3 text-sm text-white/70">
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white flex items-center justify-center text-xs font-medium">1</span>
            <span>Create your organization and choose a deployment model</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white flex items-center justify-center text-xs font-medium">2</span>
            <span>Connect your GCP project and verify permissions</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white flex items-center justify-center text-xs font-medium">3</span>
            <span>Discover and select your GKE clusters with GPU node pools</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white flex items-center justify-center text-xs font-medium">4</span>
            <span>Install the Xid-R agent in your clusters</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white flex items-center justify-center text-xs font-medium">5</span>
            <span>Configure harvesting rules and generate API keys</span>
          </li>
        </ul>
      </div>

      {/* CTA */}
      <button
        onClick={onContinue}
        disabled={loading}
        className="inline-flex items-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 rounded-full py-4 px-8 font-sans transition-all shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)] disabled:opacity-50"
      >
        {loading ? 'Starting...' : "Let's Get Started"}
        <ArrowRight className="w-5 h-5" />
      </button>

      <p className="mt-4 text-xs text-white/40">
        Setup takes approximately 10-15 minutes
      </p>
    </div>
  );
}

export default WelcomeStep;
