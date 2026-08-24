import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  RefreshCw,
  Filter,
  MoreHorizontal,
  Play,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/layout';
import { useLeases, useReleaseLease } from '@/hooks';
import { cn } from '@/lib/utils';

const statusIcons: Record<string, typeof Play> = {
  active: Play,
  pending: Clock,
  completed: CheckCircle,
  lost: XCircle,
};

const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  pending: { bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  completed: { bg: 'bg-gray-50 dark:bg-gray-900', text: 'text-gray-700 dark:text-gray-400', dot: 'bg-gray-400' },
  lost: { bg: 'bg-red-50 dark:bg-red-950', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  negotiating: { bg: 'bg-orange-50 dark:bg-orange-950', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
  checkpointing: { bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
};

const statusFilters = ['all', 'active', 'pending', 'completed', 'lost'];

export function LeasesPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const { leases, loading, error, refresh } = useLeases(statusFilter === 'all' ? undefined : statusFilter);
  const { releaseLease, loading: releasing } = useReleaseLease();

  const handleRelease = async (leaseId: string) => {
    const result = await releaseLease(leaseId);
    if (result) {
      refresh();
    }
  };

  const formatDuration = (grantedAt: string | null) => {
    if (!grantedAt) return '-';
    const start = new Date(grantedAt);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m`;
  };

  const statusCounts = {
    active: leases.filter(l => l.status === 'active').length,
    pending: leases.filter(l => l.status === 'pending').length,
    completed: leases.filter(l => l.status === 'completed').length,
    lost: leases.filter(l => l.status === 'lost').length,
  };

  return (
    <DashboardLayout
      title="Lease Management"
      subtitle="View and manage GPU leases"
      actions={
        <>
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className="h-9 px-3 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium text-foreground flex items-center gap-2 transition-colors"
            >
              <Filter className="w-4 h-4" />
              {statusFilter === 'all' ? 'All Status' : statusFilter}
              <ChevronDown className="w-4 h-4" />
            </button>
            {showFilterMenu && (
              <div className="absolute right-0 mt-2 w-40 rounded-lg border border-border bg-card shadow-lg py-1 z-10">
                {statusFilters.map((filter) => (
                  <button
                    key={filter}
                    onClick={() => {
                      setStatusFilter(filter);
                      setShowFilterMenu(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors capitalize",
                      statusFilter === filter ? "text-foreground font-medium" : "text-muted-foreground"
                    )}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="h-9 px-3 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium text-foreground flex items-center gap-2 transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Object.entries(statusCounts).map(([status, count]) => {
          const Icon = statusIcons[status] || Clock;
          const style = statusStyles[status] || statusStyles.pending;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "p-4 rounded-xl border bg-card text-left transition-all",
                statusFilter === status ? "border-foreground" : "border-border hover:border-border/80"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", style.bg)}>
                  <Icon className={cn("w-4 h-4", style.text)} />
                </div>
                <div>
                  <div className="text-xl font-semibold text-foreground">{count}</div>
                  <div className="text-xs text-muted-foreground capitalize">{status}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Leases Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground">
            {statusFilter === 'all' ? 'All Leases' : `${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Leases`}
          </h2>
          <span className="text-sm text-muted-foreground">{leases.length} leases</span>
        </div>
        <div className="overflow-x-auto">
          {loading && leases.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : leases.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <FileText className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No leases found</p>
            </div>
          ) : (
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Lease ID</th>
                  <th>Agent</th>
                  <th>GPU Type</th>
                  <th>Status</th>
                  <th>Lane</th>
                  <th>Duration</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {leases.map((lease) => {
                  const style = statusStyles[lease.status] || statusStyles.pending;
                  return (
                    <tr key={lease.id}>
                      <td>
                        <span className="font-mono text-sm">{lease.id}</span>
                      </td>
                      <td className="text-muted-foreground">{lease.tenantAgentId}</td>
                      <td className="font-medium">{lease.gpuType}</td>
                      <td>
                        <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium", style.bg, style.text)}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", style.dot)} />
                          {lease.status}
                        </span>
                      </td>
                      <td className="text-muted-foreground">{lease.capacityLane || '-'}</td>
                      <td className="text-muted-foreground">{formatDuration(lease.grantedAt)}</td>
                      <td>
                        <div className="flex items-center gap-2 justify-end">
                          {lease.status === 'active' && (
                            <button
                              onClick={() => handleRelease(lease.id)}
                              disabled={releasing}
                              className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium"
                            >
                              Release
                            </button>
                          )}
                          <Link
                            to={`/dashboard/explain?lease=${lease.id}`}
                            className="text-xs text-muted-foreground hover:text-foreground font-medium"
                          >
                            Explain
                          </Link>
                          <button className="p-1 rounded hover:bg-muted transition-colors">
                            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </div>
                      </td>
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

export default LeasesPage;
