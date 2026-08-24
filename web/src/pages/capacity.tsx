import {
  Server,
  RefreshCw,
  Plus,
  Zap,
  Cloud,
  HardDrive,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/layout';
import { useCapacity } from '@/hooks';
import { cn } from '@/lib/utils';

const typeIcons: Record<string, typeof Server> = {
  gke_node_gpu: Server,
  spot_vm: Zap,
  cloud_run_worker: Cloud,
};

const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
  available: { bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  reserved: { bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  harvestable: { bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
  leased: { bg: 'bg-purple-50 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-400', dot: 'bg-purple-500' },
  draining: { bg: 'bg-orange-50 dark:bg-orange-950', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
};

export function CapacityPage() {
  const { units, summary, loading, error, refresh } = useCapacity();

  return (
    <DashboardLayout
      title="Capacity Management"
      subtitle="View and manage GPU capacity units"
      actions={
        <>
          <button
            onClick={refresh}
            disabled={loading}
            className="h-9 px-3 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium text-foreground flex items-center gap-2 transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </button>
          <button className="h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium flex items-center gap-2 hover:bg-foreground/90 transition-colors">
            <Plus className="w-4 h-4" />
            Register
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="text-sm text-muted-foreground mb-1">Total Units</div>
            <div className="text-2xl font-semibold text-foreground">{summary.total}</div>
          </div>
          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="text-sm text-muted-foreground mb-1">Available</div>
            <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{summary.available}</div>
          </div>
          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="text-sm text-muted-foreground mb-1">Leased</div>
            <div className="text-2xl font-semibold text-purple-600 dark:text-purple-400">{summary.leased}</div>
          </div>
          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="text-sm text-muted-foreground mb-1">Harvestable</div>
            <div className="text-2xl font-semibold text-blue-600 dark:text-blue-400">{summary.harvestable}</div>
          </div>
        </div>
      )}

      {/* GPU Type Breakdown */}
      {summary && Object.keys(summary.byGpuType).length > 0 && (
        <div className="rounded-xl border border-border bg-card mb-6">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">By GPU Type</h2>
          </div>
          <div className="p-5 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(summary.byGpuType).map(([gpuType, data]) => (
              <div key={gpuType} className="p-4 rounded-lg border border-border">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <HardDrive className="w-5 h-5 text-foreground" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{gpuType}</div>
                    <div className="text-xs text-muted-foreground">
                      {data.available} of {data.total} available
                    </div>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${(data.available / Math.max(data.total, 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Capacity Units Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Capacity Units</h2>
        </div>
        <div className="overflow-x-auto">
          {loading && units.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : units.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Server className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No capacity units registered</p>
            </div>
          ) : (
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Unit ID</th>
                  <th>Type</th>
                  <th>GPU</th>
                  <th>Status</th>
                  <th>Utilization</th>
                  <th>Isolation</th>
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => {
                  const Icon = typeIcons[unit.type] || Server;
                  const style = statusStyles[unit.status] || statusStyles.available;
                  return (
                    <tr key={unit.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                            <Icon className="w-4 h-4 text-foreground" />
                          </div>
                          <span className="font-mono text-sm">{unit.id}</span>
                        </div>
                      </td>
                      <td className="text-muted-foreground">{unit.type}</td>
                      <td className="font-medium">{unit.gpuType}</td>
                      <td>
                        <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium", style.bg, style.text)}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", style.dot)} />
                          {unit.status}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-foreground rounded-full"
                              style={{ width: `${unit.utilizationPercent}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground">{unit.utilizationPercent}%</span>
                        </div>
                      </td>
                      <td className="text-muted-foreground">{unit.isolationMode}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default CapacityPage;
