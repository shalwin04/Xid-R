import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  ArrowRight,
  Lightbulb,
  Clock,
  ChevronDown,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/layout';
import { useExplain } from '@/hooks';

const eventTypes = [
  { value: '', label: 'Any Event' },
  { value: 'grant', label: 'Grant Decision' },
  { value: 'deny', label: 'Deny Decision' },
  { value: 'evict', label: 'Eviction' },
  { value: 'resume', label: 'Resume' },
];

export function ExplainPage() {
  const [searchParams] = useSearchParams();
  const [leaseId, setLeaseId] = useState(searchParams.get('lease') || '');
  const [eventType, setEventType] = useState('');
  const { explanation, explain, loading, error } = useExplain();

  useEffect(() => {
    const urlLeaseId = searchParams.get('lease');
    if (urlLeaseId) {
      setLeaseId(urlLeaseId);
      explain(urlLeaseId);
    }
  }, [searchParams]);

  const handleExplain = () => {
    if (leaseId) {
      explain(leaseId, eventType || undefined);
    }
  };

  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString();
  };

  return (
    <DashboardLayout
      title="Explain Decision"
      subtitle="Understand why scheduling and eviction decisions were made"
    >
      <div className="max-w-4xl">
        {/* Query Form */}
        <div className="rounded-xl border border-border bg-card mb-6">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Query</h2>
          </div>
          <div className="p-5">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-foreground mb-2">Lease ID</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={leaseId}
                    onChange={(e) => setLeaseId(e.target.value)}
                    placeholder="lease_abc123..."
                    className="w-full h-10 pl-10 pr-4 rounded-lg bg-muted border-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                </div>
              </div>
              <div className="w-full md:w-48">
                <label className="block text-sm font-medium text-foreground mb-2">Event Type</label>
                <div className="relative">
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    className="w-full h-10 px-4 rounded-lg bg-muted border-0 text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  >
                    {eventTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleExplain}
                  disabled={!leaseId || loading}
                  className="h-10 px-5 rounded-lg bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Analyzing...' : 'Explain'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Explanation Result */}
        {explanation && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="rounded-xl border border-border bg-card">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-amber-500" />
                  <h2 className="font-semibold text-foreground">Explanation</h2>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-muted text-xs font-medium text-foreground capitalize">
                  {explanation.lease_status}
                </span>
              </div>
              <div className="p-5">
                <p className="text-foreground leading-relaxed">{explanation.explanation}</p>
              </div>
            </div>

            {/* Decision Factors */}
            {explanation.decision_factors && explanation.decision_factors.length > 0 && (
              <div className="rounded-xl border border-border bg-card">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="font-semibold text-foreground">Decision Factors</h2>
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap gap-2">
                    {explanation.decision_factors.map((factor, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-full bg-muted text-sm text-foreground">
                        {factor}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Timeline */}
            {explanation.timeline && explanation.timeline.length > 0 && (
              <div className="rounded-xl border border-border bg-card">
                <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <h2 className="font-semibold text-foreground">Timeline</h2>
                </div>
                <div className="p-5">
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                    <div className="space-y-6">
                      {explanation.timeline.map((item, i) => (
                        <div key={i} className="relative pl-10">
                          <div className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full bg-foreground border-2 border-background" />
                          <div className="p-4 rounded-lg bg-muted">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-foreground">{item.event}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatTimestamp(item.timestamp)}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{item.details}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Example Queries */}
        {!explanation && !loading && (
          <div className="rounded-xl border border-border bg-card">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Example Queries</h2>
            </div>
            <div className="p-5 space-y-3">
              {[
                { id: 'lease_abc123', desc: 'Why was this lease granted immediately?' },
                { id: 'lease_xyz789', desc: 'Why was this agent evicted?' },
                { id: 'lease_def456', desc: 'Why is this request still pending?' },
              ].map((example) => (
                <button
                  key={example.id}
                  onClick={() => {
                    setLeaseId(example.id);
                    explain(example.id);
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted transition-colors text-left"
                >
                  <div>
                    <div className="font-mono text-sm text-foreground">{example.id}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">{example.desc}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default ExplainPage;
