/**
 * Cloud connection step - matching landing page design.
 */

import { useState } from 'react';
import { CloudCog, Upload, Key, Shield, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';

type ConnectionMethod = 'service_account' | 'workload_identity';

interface ConnectCloudStepProps {
  onContinue: (data: {
    projectId: string;
    connectionMethod: ConnectionMethod;
    serviceAccountEmail?: string;
    credentials?: string;
  }) => void;
  onBack?: () => void;
  loading?: boolean;
}

export function ConnectCloudStep({ onContinue, onBack, loading }: ConnectCloudStepProps) {
  const [projectId, setProjectId] = useState('');
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>('service_account');
  const [serviceAccountEmail, setServiceAccountEmail] = useState('');
  const [credentialsFile, setCredentialsFile] = useState<string | null>(null);
  const [credentialsFileName, setCredentialsFileName] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCredentialsFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        try {
          const json = JSON.parse(content);
          if (json.client_email) {
            setServiceAccountEmail(json.client_email);
          }
          setCredentialsFile(btoa(content));
        } catch {
          setErrors({ credentials: 'Invalid JSON file' });
        }
      };
      reader.readAsText(file);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!projectId.trim()) {
      newErrors.projectId = 'Project ID is required';
    } else if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
      newErrors.projectId = 'Invalid GCP project ID format';
    }

    if (connectionMethod === 'service_account') {
      if (!credentialsFile) {
        newErrors.credentials = 'Service account key file is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onContinue({
        projectId,
        connectionMethod,
        serviceAccountEmail: serviceAccountEmail || undefined,
        credentials: credentialsFile || undefined,
      });
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 mb-4">
          <CloudCog className="w-8 h-8 text-orange-400" />
        </div>
        <h2 className="text-3xl text-white font-serif italic mb-2">
          Connect Your{' '}
          <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
            GCP Project
          </span>
        </h2>
        <p className="text-white/60">Connect to Google Cloud Platform to discover your clusters</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Project ID */}
        <div>
          <label htmlFor="projectId" className="block text-sm font-medium text-white/80 mb-2 font-sans">
            GCP Project ID *
          </label>
          <input
            type="text"
            id="projectId"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value.toLowerCase())}
            placeholder="my-gcp-project-123"
            className={`w-full px-4 py-3 bg-white/5 border rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 backdrop-blur transition-all ${
              errors.projectId ? 'border-red-500/50' : 'border-white/10'
            }`}
          />
          {errors.projectId && <p className="mt-1 text-sm text-red-400">{errors.projectId}</p>}
        </div>

        {/* Connection Method */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-3 font-sans">
            Connection Method
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setConnectionMethod('service_account')}
              className={`p-4 rounded-xl border text-left transition-all ${
                connectionMethod === 'service_account'
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              <Key className={`w-5 h-5 mb-2 ${connectionMethod === 'service_account' ? 'text-orange-400' : 'text-white/60'}`} />
              <span className={`block font-medium font-sans ${connectionMethod === 'service_account' ? 'text-white' : 'text-white/80'}`}>
                Service Account
              </span>
              <span className="block text-xs text-white/50 mt-1">
                Upload JSON key file
              </span>
            </button>

            <button
              type="button"
              onClick={() => setConnectionMethod('workload_identity')}
              className={`p-4 rounded-xl border text-left transition-all ${
                connectionMethod === 'workload_identity'
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              <Shield className={`w-5 h-5 mb-2 ${connectionMethod === 'workload_identity' ? 'text-orange-400' : 'text-white/60'}`} />
              <span className={`block font-medium font-sans ${connectionMethod === 'workload_identity' ? 'text-white' : 'text-white/80'}`}>
                Workload Identity
              </span>
              <span className="block text-xs text-white/50 mt-1">
                Recommended for GKE
              </span>
            </button>
          </div>
        </div>

        {/* Service Account Key Upload */}
        {connectionMethod === 'service_account' && (
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2 font-sans">
              Service Account Key (JSON) *
            </label>
            <div
              className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                errors.credentials ? 'border-red-500/50' : credentialsFile ? 'border-orange-500 bg-orange-500/5' : 'border-white/20 hover:border-white/30'
              }`}
            >
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              {credentialsFile ? (
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center mx-auto">
                    <Key className="w-6 h-6 text-orange-400" />
                  </div>
                  <p className="text-sm text-white">{credentialsFileName}</p>
                  {serviceAccountEmail && (
                    <p className="text-xs text-white/50">{serviceAccountEmail}</p>
                  )}
                  <p className="text-xs text-orange-400">Click to replace</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-8 h-8 text-white/40 mx-auto" />
                  <p className="text-sm text-white/60">
                    Drop your service account JSON file here or click to browse
                  </p>
                </div>
              )}
            </div>
            {errors.credentials && (
              <p className="mt-1 text-sm text-red-400">{errors.credentials}</p>
            )}
          </div>
        )}

        {/* Workload Identity Instructions */}
        {connectionMethod === 'workload_identity' && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div className="text-sm text-amber-200/80">
                <p className="font-medium mb-2 text-amber-300">Workload Identity Setup Required</p>
                <p>
                  You'll need to configure Workload Identity Federation in your GCP project
                  and grant the appropriate IAM roles to the Xid-R service account.
                  We'll provide detailed instructions in the next step.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Security Notice */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur">
          <div className="flex gap-3">
            <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div className="text-sm text-white/60">
              <p className="font-medium text-white/80 mb-1 font-sans">Your credentials are secure</p>
              <p>
                {connectionMethod === 'service_account'
                  ? 'Credentials are encrypted and only used to verify permissions during setup. The Xid-R agent uses its own in-cluster identity.'
                  : 'Workload Identity eliminates the need for service account keys entirely.'}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4">
          {onBack ? (
            <button
              type="button"
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
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 rounded-full py-3 px-6 font-sans transition-all shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)] disabled:opacity-50"
          >
            {loading ? 'Connecting...' : 'Connect & Verify'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

export default ConnectCloudStep;
