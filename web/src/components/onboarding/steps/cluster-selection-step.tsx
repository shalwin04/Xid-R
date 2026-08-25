/**
 * Cluster discovery and selection step - matching landing page design.
 */

import { useState, useEffect } from 'react';
import { Server, Cpu, MapPin, Check, RefreshCw, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
import { DiscoveredCluster } from '../../../lib/api';

interface ClusterSelectionStepProps {
  onDiscover: () => Promise<DiscoveredCluster[]>;
  onContinue: (selectedClusters: string[]) => void;
  onBack?: () => void;
  loading?: boolean;
}

export function ClusterSelectionStep({
  onDiscover,
  onContinue,
  onBack,
  loading,
}: ClusterSelectionStepProps) {
  const [discovering, setDiscovering] = useState(true);
  const [clusters, setClusters] = useState<DiscoveredCluster[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const discoverClusters = async () => {
    setDiscovering(true);
    setError(null);
    try {
      const discovered = await onDiscover();
      setClusters(discovered);
      // Auto-select all clusters with GPU pools
      const withGpus = discovered.filter(c => c.gpuNodePools.length > 0).map(c => c.name);
      setSelected(new Set(withGpus));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDiscovering(false);
    }
  };

  useEffect(() => {
    discoverClusters();
  }, []);

  const toggleCluster = (name: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(name)) {
      newSelected.delete(name);
    } else {
      newSelected.add(name);
    }
    setSelected(newSelected);
  };

  const selectAll = () => {
    setSelected(new Set(clusters.map(c => c.name)));
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  const handleContinue = () => {
    onContinue(Array.from(selected));
  };

  const totalGpus = clusters
    .filter(c => selected.has(c.name))
    .reduce((sum, c) => sum + c.gpuNodePools.reduce((s, p) => s + p.totalGpus, 0), 0);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 mb-4">
          <Server className="w-8 h-8 text-orange-400" />
        </div>
        <h2 className="text-3xl text-white font-serif italic mb-2">
          Select{' '}
          <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
            Clusters
          </span>
        </h2>
        <p className="text-white/60">Choose which GKE clusters to manage with Xid-R</p>
      </div>

      {/* Loading State */}
      {discovering && (
        <div className="text-center py-12">
          <RefreshCw className="w-12 h-12 text-orange-400 mx-auto animate-spin mb-4" />
          <p className="text-white/60">Discovering clusters in your project...</p>
        </div>
      )}

      {/* Error State */}
      {error && !discovering && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 mb-6 backdrop-blur">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-300 font-sans">Discovery Failed</p>
              <p className="text-sm text-red-200/70 mt-1">{error}</p>
            </div>
          </div>
          <button
            onClick={discoverClusters}
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-white/70 border border-white/20 hover:border-white/40 rounded-full py-2 px-4 font-sans transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Discovery
          </button>
        </div>
      )}

      {/* Cluster List */}
      {!discovering && clusters.length > 0 && (
        <>
          {/* Selection Controls */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-white/50">
              {selected.size} of {clusters.length} clusters selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="text-sm text-orange-400 hover:text-orange-300 font-sans"
              >
                Select All
              </button>
              <span className="text-white/30">|</span>
              <button
                onClick={selectNone}
                className="text-sm text-orange-400 hover:text-orange-300 font-sans"
              >
                Select None
              </button>
            </div>
          </div>

          {/* Clusters */}
          <div className="space-y-3 mb-6">
            {clusters.map((cluster) => {
              const isSelected = selected.has(cluster.name);
              const hasGpus = cluster.gpuNodePools.length > 0;
              const totalClusterGpus = cluster.gpuNodePools.reduce((s, p) => s + p.totalGpus, 0);

              return (
                <button
                  key={cluster.name}
                  onClick={() => toggleCluster(cluster.name)}
                  className={`w-full p-4 rounded-2xl border text-left transition-all backdrop-blur ${
                    isSelected
                      ? 'border-orange-500 bg-orange-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      {/* Selection indicator */}
                      <div
                        className={`mt-1 w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all ${
                          isSelected
                            ? 'border-orange-500 bg-gradient-to-r from-orange-500 to-amber-500'
                            : 'border-white/30'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>

                      <div>
                        <h3 className={`font-semibold font-sans ${isSelected ? 'text-white' : 'text-white/80'}`}>
                          {cluster.name}
                        </h3>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="flex items-center gap-1 text-sm text-white/50">
                            <MapPin className="w-3.5 h-3.5" />
                            {cluster.location}
                          </span>
                          {hasGpus && (
                            <span className="flex items-center gap-1 text-sm text-emerald-400">
                              <Cpu className="w-3.5 h-3.5" />
                              {totalClusterGpus} GPUs
                            </span>
                          )}
                        </div>

                        {/* GPU Node Pools */}
                        {hasGpus && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {cluster.gpuNodePools.map((pool) => (
                              <span
                                key={pool.name}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs"
                              >
                                <span className="text-white/50">{pool.name}:</span>
                                <span className="text-orange-400">{pool.totalGpus}x {pool.gpuType}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {!hasGpus && (
                      <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded-lg">
                        No GPUs
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Summary */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur mb-6">
            <div className="flex items-center justify-between">
              <span className="text-white/60">Selected GPU capacity:</span>
              <span className="text-lg font-semibold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
                {totalGpus} GPUs
              </span>
            </div>
          </div>
        </>
      )}

      {/* No Clusters Found */}
      {!discovering && clusters.length === 0 && !error && (
        <div className="text-center py-12">
          <Server className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <p className="text-white/60 mb-2">No clusters found in your project</p>
          <p className="text-sm text-white/40">
            Make sure you have GKE clusters with GPU node pools in your project.
          </p>
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
          disabled={loading || discovering || selected.size === 0}
          className="inline-flex items-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 rounded-full py-3 px-6 font-sans transition-all shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)] disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Continue'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default ClusterSelectionStep;
