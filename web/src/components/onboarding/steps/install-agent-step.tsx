/**
 * Install agent step - matching landing page design.
 */

import { useState, useEffect } from 'react';
import { Terminal, Copy, Check, ArrowRight, ArrowLeft, ExternalLink, AlertTriangle } from 'lucide-react';
import { InstallCommand } from '../../../lib/api';

interface InstallAgentStepProps {
  onGetCommands: () => Promise<InstallCommand[]>;
  onContinue: () => void;
  onBack?: () => void;
  loading?: boolean;
}

export function InstallAgentStep({
  onGetCommands,
  onContinue,
  onBack,
  loading,
}: InstallAgentStepProps) {
  const [commands, setCommands] = useState<InstallCommand[]>([]);
  const [fetching, setFetching] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState<'kubectl' | 'helm'>('kubectl');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchCommands = async () => {
      try {
        const result = await onGetCommands();
        setCommands(result);
      } catch (err) {
        console.error('Failed to get install commands:', err);
      } finally {
        setFetching(false);
      }
    };
    fetchCommands();
  }, []);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 mb-4">
          <Terminal className="w-8 h-8 text-orange-400" />
        </div>
        <h2 className="text-3xl text-white font-serif italic mb-2">
          Install the{' '}
          <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
            Xid-R Agent
          </span>
        </h2>
        <p className="text-white/60">Deploy the agent to your clusters using kubectl or Helm</p>
      </div>

      {/* Method Selection */}
      <div className="flex rounded-xl bg-white/5 border border-white/10 p-1 mb-6">
        <button
          onClick={() => setSelectedMethod('kubectl')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium font-sans transition-all ${
            selectedMethod === 'kubectl'
              ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white'
              : 'text-white/60 hover:text-white'
          }`}
        >
          kubectl
        </button>
        <button
          onClick={() => setSelectedMethod('helm')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium font-sans transition-all ${
            selectedMethod === 'helm'
              ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white'
              : 'text-white/60 hover:text-white'
          }`}
        >
          Helm
        </button>
      </div>

      {/* Loading */}
      {fetching && (
        <div className="text-center py-8">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-white/10 rounded w-3/4 mx-auto" />
            <div className="h-32 bg-white/5 rounded-xl" />
          </div>
        </div>
      )}

      {/* Commands */}
      {!fetching && commands.length > 0 && (
        <div className="space-y-6 mb-8">
          {commands.map((cmd) => (
            <div key={cmd.clusterId} className="rounded-2xl border border-white/10 overflow-hidden backdrop-blur">
              {/* Cluster Header */}
              <div className="px-4 py-3 bg-white/5 border-b border-white/10 flex items-center justify-between">
                <div>
                  <span className="font-medium text-white font-sans">{cmd.clusterName}</span>
                  <span className="text-xs text-white/40 ml-2">({cmd.clusterId})</span>
                </div>
              </div>

              {/* Command */}
              <div className="relative">
                <pre className="p-4 text-sm text-orange-300 overflow-x-auto bg-black/20">
                  <code>
                    {selectedMethod === 'kubectl' ? cmd.kubectlCommand : cmd.helmCommand}
                  </code>
                </pre>
                <button
                  onClick={() =>
                    copyToClipboard(
                      selectedMethod === 'kubectl' ? cmd.kubectlCommand : cmd.helmCommand,
                      cmd.clusterId
                    )
                  }
                  className="absolute top-2 right-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                >
                  {copiedId === cmd.clusterId ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-white/60" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Instructions */}
      <div className="space-y-4 mb-8">
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur">
          <h3 className="font-medium text-white mb-3 font-sans">Installation Steps:</h3>
          <ol className="space-y-2 text-sm text-white/60">
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white flex items-center justify-center text-xs font-medium">1</span>
              <span>Connect to your GKE cluster: <code className="text-orange-400">gcloud container clusters get-credentials CLUSTER_NAME</code></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white flex items-center justify-center text-xs font-medium">2</span>
              <span>Copy and run the command above for each cluster</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white flex items-center justify-center text-xs font-medium">3</span>
              <span>Wait for the agent pod to reach Running state</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white flex items-center justify-center text-xs font-medium">4</span>
              <span>Click "Verify Installation" to confirm connectivity</span>
            </li>
          </ol>
        </div>

        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 backdrop-blur">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-300 font-sans">Important</p>
              <p className="text-amber-200/70 mt-1">
                The agent requires cluster-admin permissions to monitor GPU utilization and manage workloads.
                Make sure you have the necessary RBAC permissions before installing.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Resources */}
      <div className="flex items-center gap-4 text-sm text-white/50 mb-8">
        <a
          href="#"
          className="flex items-center gap-1 text-orange-400 hover:text-orange-300 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Documentation
        </a>
        <a
          href="#"
          className="flex items-center gap-1 text-orange-400 hover:text-orange-300 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Troubleshooting Guide
        </a>
      </div>

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
          onClick={onContinue}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 rounded-full py-3 px-6 font-sans transition-all shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)] disabled:opacity-50"
        >
          {loading ? 'Verifying...' : 'Verify Installation'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default InstallAgentStep;
