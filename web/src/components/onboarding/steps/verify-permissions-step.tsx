/**
 * Verify permissions step - matching landing page design.
 */

import { useState, useEffect } from 'react';
import { Shield, Check, X, RefreshCw, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';

interface VerifyPermissionsStepProps {
  onVerify: () => Promise<{ results: Record<string, boolean>; errors: string[] }>;
  onContinue: () => void;
  onBack?: () => void;
  loading?: boolean;
}

const REQUIRED_PERMISSIONS = [
  { name: 'container.clusters.get', description: 'Read GKE cluster details' },
  { name: 'container.clusters.list', description: 'List GKE clusters' },
  { name: 'container.nodePools.get', description: 'Read node pool details' },
  { name: 'container.nodePools.list', description: 'List node pools' },
  { name: 'compute.instances.get', description: 'Read compute instance details' },
  { name: 'compute.instances.list', description: 'List compute instances' },
  { name: 'monitoring.timeSeries.list', description: 'Read monitoring metrics' },
  { name: 'storage.objects.create', description: 'Create checkpoint storage' },
  { name: 'storage.objects.get', description: 'Read checkpoint data' },
  { name: 'storage.objects.delete', description: 'Delete old checkpoints' },
];

export function VerifyPermissionsStep({
  onVerify,
  onContinue,
  onBack,
  loading,
}: VerifyPermissionsStepProps) {
  const [verifying, setVerifying] = useState(false);
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<string[]>([]);

  const handleVerify = async () => {
    setVerifying(true);
    setErrors([]);
    try {
      const response = await onVerify();
      setResults(response.results);
      setErrors(response.errors);
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setVerifying(false);
    }
  };

  // Auto-verify on mount
  useEffect(() => {
    handleVerify();
  }, []);

  const allPermissionsGranted = Object.values(results).every(v => v);
  const hasResults = Object.keys(results).length > 0;

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 mb-4">
          <Shield className="w-8 h-8 text-orange-400" />
        </div>
        <h2 className="text-3xl text-white font-serif italic mb-2">
          Verifying{' '}
          <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
            Permissions
          </span>
        </h2>
        <p className="text-white/60">Checking that your service account has the required access</p>
      </div>

      {/* Permission List */}
      <div className="space-y-2 mb-6">
        {REQUIRED_PERMISSIONS.map((perm) => {
          const status = results[perm.name];
          const isChecking = verifying && status === undefined;

          return (
            <div
              key={perm.name}
              className={`flex items-center justify-between p-3 rounded-xl border backdrop-blur transition-all ${
                status === true
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : status === false
                  ? 'border-red-500/30 bg-red-500/5'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                {isChecking ? (
                  <RefreshCw className="w-5 h-5 text-orange-400 animate-spin" />
                ) : status === true ? (
                  <Check className="w-5 h-5 text-emerald-400" />
                ) : status === false ? (
                  <X className="w-5 h-5 text-red-400" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-white/30" />
                )}
                <div>
                  <p className="text-sm font-mono text-white/80">{perm.name}</p>
                  <p className="text-xs text-white/50">{perm.description}</p>
                </div>
              </div>
              {hasResults && (
                <span
                  className={`text-xs font-medium font-sans ${
                    status === true ? 'text-emerald-400' : status === false ? 'text-red-400' : 'text-white/50'
                  }`}
                >
                  {status === true ? 'Granted' : status === false ? 'Missing' : 'Pending'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Status Message */}
      {hasResults && (
        <div
          className={`p-4 rounded-xl mb-6 backdrop-blur ${
            allPermissionsGranted
              ? 'bg-emerald-500/10 border border-emerald-500/30'
              : 'bg-red-500/10 border border-red-500/30'
          }`}
        >
          <div className="flex items-start gap-3">
            {allPermissionsGranted ? (
              <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            )}
            <div>
              <p className={`font-medium font-sans ${allPermissionsGranted ? 'text-emerald-300' : 'text-red-300'}`}>
                {allPermissionsGranted
                  ? 'All permissions verified!'
                  : 'Some permissions are missing'}
              </p>
              <p className={`text-sm mt-1 ${allPermissionsGranted ? 'text-emerald-200/70' : 'text-red-200/70'}`}>
                {allPermissionsGranted
                  ? 'Your service account has all the required permissions to proceed.'
                  : 'Please grant the missing permissions to your service account and try again.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 mb-6 backdrop-blur">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-300 font-sans">Verification Failed</p>
              {errors.map((error, i) => (
                <p key={i} className="text-sm text-red-200/70 mt-1">{error}</p>
              ))}
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
        <div className="flex gap-3">
          {!allPermissionsGranted && hasResults && (
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="inline-flex items-center gap-2 text-sm font-medium text-white/70 border border-white/20 hover:border-white/40 rounded-full py-3 px-5 font-sans transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${verifying ? 'animate-spin' : ''}`} />
              Retry
            </button>
          )}
          <button
            onClick={onContinue}
            disabled={loading || verifying || !allPermissionsGranted}
            className="inline-flex items-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 rounded-full py-3 px-6 font-sans transition-all shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)] disabled:opacity-50"
          >
            {loading ? 'Continuing...' : 'Continue'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default VerifyPermissionsStep;
