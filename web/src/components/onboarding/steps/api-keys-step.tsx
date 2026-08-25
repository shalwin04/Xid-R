/**
 * Generate API keys step - matching landing page design.
 */

import { useState } from 'react';
import { Key, Copy, Check, ArrowRight, ArrowLeft, AlertTriangle, Shield } from 'lucide-react';

interface ApiKeysStepProps {
  onGenerate: (keyName: string) => Promise<{ key: string; id: string }>;
  onContinue: () => void;
  onBack?: () => void;
  loading?: boolean;
}

export function ApiKeysStep({
  onGenerate,
  onContinue,
  onBack,
  loading,
}: ApiKeysStepProps) {
  const [keyName, setKeyName] = useState('Production API Key');
  const [generatedKey, setGeneratedKey] = useState<{ key: string; id: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!keyName.trim()) {
      setError('Key name is required');
      return;
    }

    setGenerating(true);
    setError(null);
    try {
      const result = await onGenerate(keyName);
      setGeneratedKey(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    if (!generatedKey) return;
    try {
      await navigator.clipboard.writeText(generatedKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 mb-4">
          <Key className="w-8 h-8 text-orange-400" />
        </div>
        <h2 className="text-3xl text-white font-serif italic mb-2">
          Generate{' '}
          <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
            API Keys
          </span>
        </h2>
        <p className="text-white/60">Create API keys for your agents to authenticate with Xid-R</p>
      </div>

      {!generatedKey ? (
        <>
          {/* Key Name Input */}
          <div className="mb-6">
            <label htmlFor="keyName" className="block text-sm font-medium text-white/80 mb-2 font-sans">
              API Key Name
            </label>
            <input
              type="text"
              id="keyName"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="My API Key"
              className={`w-full px-4 py-3 bg-white/5 border rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 backdrop-blur transition-all ${
                error ? 'border-red-500/50' : 'border-white/10'
              }`}
            />
            {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
          </div>

          {/* Info */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur mb-6">
            <div className="flex gap-3">
              <Shield className="w-5 h-5 text-orange-400 flex-shrink-0" />
              <div className="text-sm text-white/60">
                <p className="font-medium text-white/80 mb-1 font-sans">API Key Permissions</p>
                <p>
                  This key will have access to request GPU capacity, manage checkpoints,
                  and view lease status. You can create additional keys with different
                  permissions later.
                </p>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full inline-flex items-center justify-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 rounded-full py-3 px-6 font-sans transition-all shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)] disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate API Key'}
          </button>
        </>
      ) : (
        <>
          {/* Success Message */}
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 mb-6 backdrop-blur">
            <div className="flex items-start gap-3">
              <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-emerald-300 font-sans">API Key Generated!</p>
                <p className="text-sm text-emerald-200/70 mt-1">
                  Your API key has been created successfully.
                </p>
              </div>
            </div>
          </div>

          {/* API Key Display */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-white/80 mb-2 font-sans">
              Your API Key
            </label>
            <div className="relative">
              <div className="p-4 bg-black/30 border border-white/10 rounded-xl font-mono text-sm text-orange-300 break-all pr-12">
                {generatedKey.key}
              </div>
              <button
                onClick={copyToClipboard}
                className="absolute top-1/2 right-3 -translate-y-1/2 p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4 text-white/60" />
                )}
              </button>
            </div>
          </div>

          {/* Warning */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-6 backdrop-blur">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-300 font-sans">Save this key securely!</p>
                <p className="text-amber-200/70 mt-1">
                  This is the only time you'll see this key. Store it in a secure location
                  like a password manager or secrets vault. You won't be able to retrieve
                  it later.
                </p>
              </div>
            </div>
          </div>

          {/* Usage Example */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur mb-6">
            <p className="text-sm font-medium text-white/80 mb-3 font-sans">Quick Start Example:</p>
            <pre className="text-xs text-white/50 overflow-x-auto">
{`curl -X POST https://api.xidr.dev/mcp/tools/xidr_request_gpu \\
  -H "Authorization: Bearer ${generatedKey.key.slice(0, 20)}..." \\
  -H "Content-Type: application/json" \\
  -d '{"gpu_type": "nvidia-t4", "a2a_endpoint": "https://..."}'`}
            </pre>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        {onBack && !generatedKey ? (
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
        {generatedKey && (
          <button
            onClick={onContinue}
            disabled={loading}
            className="inline-flex items-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 rounded-full py-3 px-6 font-sans transition-all shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)] disabled:opacity-50"
          >
            {loading ? 'Finishing...' : 'Complete Setup'}
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default ApiKeysStep;
