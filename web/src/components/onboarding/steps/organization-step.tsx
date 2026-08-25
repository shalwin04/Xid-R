/**
 * Organization details step - matching landing page design.
 */

import { useState } from 'react';
import { Building2, ArrowRight, ArrowLeft } from 'lucide-react';

interface OrganizationStepProps {
  onContinue: (data: {
    name: string;
    domain?: string;
    billingEmail: string;
    plan?: 'free' | 'pro' | 'enterprise';
  }) => void;
  onBack?: () => void;
  loading?: boolean;
  initialEmail?: string;
}

export function OrganizationStep({ onContinue, onBack, loading, initialEmail }: OrganizationStepProps) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [billingEmail, setBillingEmail] = useState(initialEmail || '');
  const [plan, setPlan] = useState<'free' | 'pro' | 'enterprise'>('free');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Organization name is required';
    if (!billingEmail.trim()) newErrors.billingEmail = 'Billing email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
      newErrors.billingEmail = 'Invalid email format';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onContinue({ name, domain: domain || undefined, billingEmail, plan });
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 mb-4">
          <Building2 className="w-8 h-8 text-orange-400" />
        </div>
        <h2 className="text-3xl text-white font-serif italic mb-2">
          Organization{' '}
          <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
            Details
          </span>
        </h2>
        <p className="text-white/60">Tell us about your organization</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Organization Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-white/80 mb-2 font-sans">
            Organization Name *
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Corp"
            className={`w-full px-4 py-3 bg-white/5 border rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 backdrop-blur transition-all ${
              errors.name ? 'border-red-500/50' : 'border-white/10'
            }`}
          />
          {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name}</p>}
        </div>

        {/* Domain */}
        <div>
          <label htmlFor="domain" className="block text-sm font-medium text-white/80 mb-2 font-sans">
            Company Domain
            <span className="text-white/40 font-normal ml-2">(optional)</span>
          </label>
          <input
            type="text"
            id="domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="acme.com"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 backdrop-blur transition-all"
          />
        </div>

        {/* Billing Email */}
        <div>
          <label htmlFor="billingEmail" className="block text-sm font-medium text-white/80 mb-2 font-sans">
            Billing Email *
          </label>
          <input
            type="email"
            id="billingEmail"
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
            placeholder="billing@acme.com"
            className={`w-full px-4 py-3 bg-white/5 border rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 backdrop-blur transition-all ${
              errors.billingEmail ? 'border-red-500/50' : 'border-white/10'
            }`}
          />
          {errors.billingEmail && <p className="mt-1 text-sm text-red-400">{errors.billingEmail}</p>}
        </div>

        {/* Plan Selection */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-3 font-sans">
            Select Plan
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(['free', 'pro', 'enterprise'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlan(p)}
                className={`p-4 rounded-xl border text-center transition-all ${
                  plan === p
                    ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20'
                }`}
              >
                <span className="block font-semibold capitalize font-sans">{p}</span>
                <span className="block text-xs mt-1 text-white/40">
                  {p === 'free' && '1 cluster'}
                  {p === 'pro' && '5 clusters'}
                  {p === 'enterprise' && 'Unlimited'}
                </span>
              </button>
            ))}
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
            {loading ? 'Creating...' : 'Continue'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

export default OrganizationStep;
