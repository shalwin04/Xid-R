import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Server,
  MessageSquare,
  Settings,
  Bell,
  Search,
  RefreshCw,
  Plus,
  ChevronRight,
  Zap,
  Clock,
  DollarSign,
  CheckCircle,
  TrendingUp,
  MoreHorizontal,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/layout';
import { useDashboard } from '@/hooks';
import { cn, timeAgo } from '@/lib/utils';

const eventTypeStyles: Record<string, { bg: string; text: string; icon: string }> = {
  lease_granted: { bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-400', icon: 'text-emerald-500' },
  lease_released: { bg: 'bg-gray-50 dark:bg-gray-900', text: 'text-gray-700 dark:text-gray-400', icon: 'text-gray-500' },
  checkpoint_completed: { bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-400', icon: 'text-blue-500' },
  reclaim_initiated: { bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-400', icon: 'text-amber-500' },
  capacity_discovered: { bg: 'bg-purple-50 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-400', icon: 'text-purple-500' },
};

const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  pending: { bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  negotiating: { bg: 'bg-orange-50 dark:bg-orange-950', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
  checkpointing: { bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
};

export function DashboardPage() {
  const { state, connected, loading, error, refresh } = useDashboard();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  const stats = [
    {
      label: 'Active Leases',
      value: state.stats.activeLeases,
      icon: Zap,
      trend: '+2 from yesterday',
      color: 'text-emerald-600 dark:text-emerald-400'
    },
    {
      label: 'Pending Requests',
      value: state.stats.pendingRequests,
      icon: Clock,
      trend: 'Queue depth',
      color: 'text-amber-600 dark:text-amber-400'
    },
    {
      label: 'Total Savings',
      value: `$${state.stats.totalSavingsUsd.toFixed(2)}`,
      icon: DollarSign,
      trend: 'vs on-demand pricing',
      color: 'text-blue-600 dark:text-blue-400'
    },
    {
      label: 'Checkpoints',
      value: state.stats.checkpointsCompleted,
      icon: CheckCircle,
      trend: 'Completed successfully',
      color: 'text-purple-600 dark:text-purple-400'
    },
  ];

  return (
    <DashboardLayout
      title="Dashboard"
      subtitle="Monitor GPU capacity and lease activity"
      actions={
        <>
          <div className="hidden md:flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                className="w-48 h-9 pl-9 pr-4 rounded-lg bg-muted border-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>
          </div>
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
            connected ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
          )}>
            <div className={cn("w-1.5 h-1.5 rounded-full", connected ? "bg-emerald-500" : "bg-red-500")} />
            {connected ? "Live" : "Offline"}
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-9 px-3 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium text-foreground flex items-center gap-2 transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            Refresh
          </button>
          <button className="relative h-9 w-9 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors">
            <Bell className="w-4 h-4 text-foreground" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-500" />
          </button>
        </>
      }
    >
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Overview</h2>
        </div>
        <Link
          to="/dashboard/leases"
          className="h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium flex items-center gap-2 hover:bg-foreground/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Request
        </Link>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
          <p className="text-sm font-medium">Failed to load data</p>
          <p className="text-sm opacity-80 mt-0.5">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && !state.stats.activeLeases && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => (
          <div key={stat.label} className="p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">{stat.label}</span>
              <stat.icon className={cn("w-4 h-4", stat.color)} />
            </div>
            <div className="text-2xl font-semibold text-foreground">{stat.value}</div>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{stat.trend}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column - Leases & Events */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Leases */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Active Leases</h2>
              <Link
                to="/dashboard/leases"
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                View all
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="p-5">
              {state.leases.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                    <Server className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No active leases</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {state.leases.slice(0, 5).map((lease) => {
                    const style = statusStyles[lease.status] || statusStyles.pending;
                    return (
                      <div
                        key={lease.id}
                        className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn("w-2 h-2 rounded-full", style.dot)} />
                          <div>
                            <div className="font-mono text-sm text-foreground">{lease.id}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {lease.agentId} • {lease.gpuType}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn("px-2 py-1 rounded text-xs font-medium", style.bg, style.text)}>
                            {lease.status}
                          </span>
                          {lease.grantedAt && (
                            <span className="text-xs text-muted-foreground">
                              {timeAgo(lease.grantedAt)}
                            </span>
                          )}
                          <button className="p-1 rounded hover:bg-muted transition-colors">
                            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent Events */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Recent Events</h2>
              <span className="text-xs text-muted-foreground">Last 24 hours</span>
            </div>
            <div className="p-5">
              {state.events.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                    <Clock className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No recent events</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {state.events.slice(0, 6).map((event) => {
                    const style = eventTypeStyles[event.type] || eventTypeStyles.lease_released;
                    return (
                      <div key={event.id} className="flex items-start gap-3">
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", style.bg)}>
                          <Zap className={cn("w-4 h-4", style.icon)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={cn("text-sm font-medium", style.text)}>
                              {event.type.replace(/_/g, ' ')}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {timeAgo(event.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5 truncate">
                            {event.summary}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column - Capacity */}
        <div className="space-y-6">
          {/* Capacity Overview */}
          <div className="rounded-xl border border-border bg-card">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Capacity Overview</h2>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-center mb-6">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="12"
                      className="text-muted"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={`${(state.capacity.leased / Math.max(state.capacity.total, 1)) * 251.2} 251.2`}
                      className="text-foreground"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-semibold text-foreground">
                      {state.capacity.total > 0
                        ? Math.round((state.capacity.leased / state.capacity.total) * 100)
                        : 0}%
                    </span>
                    <span className="text-xs text-muted-foreground">utilized</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center">
                  <div className="text-xl font-semibold text-foreground">{state.capacity.total}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">{state.capacity.available}</div>
                  <div className="text-xs text-muted-foreground">Available</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-semibold text-foreground">{state.capacity.leased}</div>
                  <div className="text-xs text-muted-foreground">Leased</div>
                </div>
              </div>

              {Object.keys(state.capacity.byGpuType).length > 0 && (
                <div className="space-y-3 pt-4 border-t border-border">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">By GPU Type</span>
                  {Object.entries(state.capacity.byGpuType).map(([type, data]) => (
                    <div key={type}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-foreground font-medium">{type}</span>
                        <span className="text-muted-foreground">{data.available}/{data.total}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-foreground rounded-full transition-all"
                          style={{ width: `${(data.available / Math.max(data.total, 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-xl border border-border bg-card">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Quick Actions</h2>
            </div>
            <div className="p-3">
              <Link
                to="/dashboard/explain"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">Explain Decision</div>
                  <div className="text-xs text-muted-foreground">Query scheduling decisions</div>
                </div>
              </Link>
              <Link
                to="/dashboard/capacity"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                  <Server className="w-4 h-4 text-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">Manage Capacity</div>
                  <div className="text-xs text-muted-foreground">View and register GPUs</div>
                </div>
              </Link>
              <Link
                to="/dashboard/settings"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                  <Settings className="w-4 h-4 text-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">System Health</div>
                  <div className="text-xs text-muted-foreground">Check connection status</div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default DashboardPage;
