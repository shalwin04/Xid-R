/**
 * Onboarding complete step - matching landing page design.
 */

import { CheckCircle2, ArrowRight, ExternalLink, BookOpen, MessageSquare, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

interface CompleteStepProps {
  organizationName?: string;
  clusterCount?: number;
  gpuCount?: number;
}

export function CompleteStep({
  organizationName,
  clusterCount = 0,
  gpuCount = 0,
}: CompleteStepProps) {
  return (
    <div className="max-w-2xl mx-auto text-center">
      {/* Success Animation */}
      <div className="relative mb-8">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-32 h-32 rounded-full bg-gradient-to-r from-orange-500/20 to-amber-500/20 animate-ping" />
        </div>
        <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 shadow-[0_0_40px_rgba(249,115,22,0.5)]">
          <CheckCircle2 className="w-12 h-12 text-white" />
        </div>
      </div>

      {/* Title */}
      <h1 className="text-4xl sm:text-5xl text-white tracking-tight font-serif font-normal italic mb-4">
        You're{' '}
        <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500 bg-clip-text text-transparent">
          All Set!
        </span>
      </h1>
      <p className="text-lg text-white/60 mb-8">
        {organizationName ? (
          <>
            <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent font-medium">
              {organizationName}
            </span>{' '}
            is now connected to Xid-R
          </>
        ) : (
          'Your organization is now connected to Xid-R'
        )}
      </p>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 mb-10">
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur">
          <div className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent mb-1">
            {clusterCount}
          </div>
          <div className="text-sm text-white/50">Clusters Connected</div>
        </div>
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur">
          <div className="text-3xl font-bold text-emerald-400 mb-1">{gpuCount}</div>
          <div className="text-sm text-white/50">GPUs Available</div>
        </div>
      </div>

      {/* What's Next */}
      <div className="text-left p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur mb-8">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2 font-sans">
          <Zap className="w-5 h-5 text-orange-400" />
          What's Next?
        </h3>
        <ul className="space-y-4">
          <li className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-medium text-orange-400">1</span>
            </div>
            <div>
              <p className="font-medium text-white/80 font-sans">Explore the Dashboard</p>
              <p className="text-sm text-white/50">
                View real-time GPU utilization, active leases, and cost savings
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-medium text-orange-400">2</span>
            </div>
            <div>
              <p className="font-medium text-white/80 font-sans">Configure Harvesting Rules</p>
              <p className="text-sm text-white/50">
                Set up automatic approval policies for different GPU types and workloads
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-medium text-orange-400">3</span>
            </div>
            <div>
              <p className="font-medium text-white/80 font-sans">Integrate Your Agents</p>
              <p className="text-sm text-white/50">
                Use the MCP tools to let your AI agents request GPU capacity
              </p>
            </div>
          </li>
        </ul>
      </div>

      {/* Quick Links */}
      <div className="flex flex-wrap justify-center gap-3 mb-10">
        <a
          href="#"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 text-sm text-white/70 hover:text-white transition-all backdrop-blur"
        >
          <BookOpen className="w-4 h-4" />
          Documentation
          <ExternalLink className="w-3 h-3 text-white/40" />
        </a>
        <a
          href="#"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 text-sm text-white/70 hover:text-white transition-all backdrop-blur"
        >
          <MessageSquare className="w-4 h-4" />
          Join Discord
          <ExternalLink className="w-3 h-3 text-white/40" />
        </a>
      </div>

      {/* CTA */}
      <Link to="/dashboard">
        <button className="inline-flex items-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 rounded-full py-4 px-8 font-sans transition-all shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)]">
          Go to Dashboard
          <ArrowRight className="w-5 h-5" />
        </button>
      </Link>
    </div>
  );
}

export default CompleteStep;
