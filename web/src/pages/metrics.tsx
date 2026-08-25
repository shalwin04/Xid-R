'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Bell,
  Cpu,
  Users,
  DollarSign,
  Database,
  HardDrive,
  TrendingUp,
  Activity,
  Zap,
  Clock,
  CheckCircle,
  XCircle,
  BarChart3,
  ArrowUpRight,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/layout';
import { useDashboard } from '@/hooks';
import { cn } from '@/lib/utils';
import {
  SavingsAreaChart,
  GpuUtilizationChart,
  TenantPieChart,
  CheckpointDonutChart,
  CostComparisonChart,
  NodeHealthGrid,
  MetricCard,
  ProgressRing,
} from '@/components/ui/charts';

// Format bytes helper
function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Format duration helper
function formatDuration(ms: number): string {
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(2) + 's';
}

export function MetricsPage() {
  const { state, connected, loading, refresh } = useDashboard();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'gpu' | 'costs' | 'checkpoints'>('overview');

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'gpu', label: 'GPU Metrics', icon: Cpu },
    { id: 'costs', label: 'Cost Analytics', icon: DollarSign },
    { id: 'checkpoints', label: 'Checkpoints', icon: Database },
  ] as const;

  return (
    <DashboardLayout
      title="Metrics"
      subtitle="Detailed analytics and performance metrics"
      actions={
        <>
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
            connected
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
          )}>
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", connected ? "bg-emerald-500" : "bg-red-500")} />
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
          </button>
        </>
      }
    >
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg mb-6 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* Overview Tab */}
        {activeTab === 'overview' && !loading && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* Key Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <MetricCard
                label="Active Leases"
                value={state.stats.activeLeases}
                icon={<Zap className="w-4 h-4" />}
                color="success"
                delay={0}
              />
              <MetricCard
                label="Pending Requests"
                value={state.stats.pendingRequests}
                icon={<Clock className="w-4 h-4" />}
                color="warning"
                delay={0.05}
              />
              <MetricCard
                label="Total Savings"
                value={`$${state.stats.totalSavingsUsd.toFixed(4)}`}
                trend={state.costAnalytics.savingsPercent}
                trendLabel="vs baseline"
                icon={<DollarSign className="w-4 h-4" />}
                color="success"
                delay={0.1}
              />
              <MetricCard
                label="Checkpoints"
                value={state.stats.checkpointsCompleted}
                trend={state.checkpointAnalytics.successRate - 50}
                trendLabel="success rate"
                icon={<CheckCircle className="w-4 h-4" />}
                color="purple"
                delay={0.15}
              />
            </div>

            {/* Charts Grid */}
            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              {/* Savings Trend */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">Savings Trend</h3>
                    <p className="text-sm text-muted-foreground">Daily cost savings over time</p>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      ${state.costAnalytics.totalSavingsUsd.toFixed(4)}
                    </span>
                  </div>
                </div>
                <SavingsAreaChart data={state.costAnalytics.daily} height={220} />
              </div>

              {/* Capacity Overview */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">Capacity Overview</h3>
                    <p className="text-sm text-muted-foreground">Current resource utilization</p>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-12">
                  <ProgressRing
                    percentage={(state.capacity.leased / Math.max(state.capacity.total, 1)) * 100}
                    size={140}
                    color="#3b82f6"
                    label="Utilized"
                  />
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <div>
                        <div className="text-sm text-muted-foreground">Leased</div>
                        <div className="text-lg font-semibold text-foreground">{state.capacity.leased}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      <div>
                        <div className="text-sm text-muted-foreground">Available</div>
                        <div className="text-lg font-semibold text-foreground">{state.capacity.available}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-gray-400" />
                      <div>
                        <div className="text-sm text-muted-foreground">Total</div>
                        <div className="text-lg font-semibold text-foreground">{state.capacity.total}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Row */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Tenant Distribution */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">Tenant Distribution</h3>
                    <p className="text-sm text-muted-foreground">Active leases by tenant</p>
                  </div>
                  <Users className="w-5 h-5 text-muted-foreground" />
                </div>
                {state.tenantBreakdown.length > 0 ? (
                  <>
                    <TenantPieChart data={state.tenantBreakdown} height={180} />
                    <div className="mt-4 space-y-2">
                      {state.tenantBreakdown.slice(0, 4).map((tenant, i) => (
                        <div key={tenant.tenantId} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: ['#3b82f6', '#8b5cf6', '#06b6d4', '#ec4899'][i] }}
                            />
                            <span className="text-muted-foreground truncate max-w-[120px]">{tenant.tenantName}</span>
                          </div>
                          <span className="font-medium text-foreground">{tenant.activeLeases} leases</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8">
                    <Users className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No tenant data</p>
                  </div>
                )}
              </div>

              {/* Checkpoint Health */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">Checkpoint Health</h3>
                    <p className="text-sm text-muted-foreground">Success vs failure rate</p>
                  </div>
                  <Database className="w-5 h-5 text-muted-foreground" />
                </div>
                <CheckpointDonutChart
                  complete={state.checkpointAnalytics.complete}
                  restored={state.checkpointAnalytics.restored}
                  failed={state.checkpointAnalytics.failed}
                  height={180}
                />
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                      {state.checkpointAnalytics.complete}
                    </div>
                    <div className="text-xs text-muted-foreground">Complete</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {state.checkpointAnalytics.restored}
                    </div>
                    <div className="text-xs text-muted-foreground">Restored</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-red-600 dark:text-red-400">
                      {state.checkpointAnalytics.failed}
                    </div>
                    <div className="text-xs text-muted-foreground">Failed</div>
                  </div>
                </div>
              </div>

              {/* GKE Nodes Health */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">GKE Node Health</h3>
                    <p className="text-sm text-muted-foreground">{state.gkeNodes.length} nodes tracked</p>
                  </div>
                  <HardDrive className="w-5 h-5 text-muted-foreground" />
                </div>
                {state.gkeNodes.length > 0 ? (
                  <>
                    <NodeHealthGrid
                      nodes={state.gkeNodes.map((n) => ({
                        nodeName: n.nodeName,
                        status: n.status,
                        totalUtilization: n.totalUtilization,
                        gpuCount: n.gpuCount,
                      }))}
                    />
                    <div className="mt-4 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-muted-foreground">Healthy</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-amber-500" />
                          <span className="text-muted-foreground">Degraded</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <span className="text-muted-foreground">Offline</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8">
                    <HardDrive className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No GKE nodes discovered</p>
                    <p className="text-xs text-muted-foreground mt-1">Set USE_REAL_GKE=true</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* GPU Metrics Tab */}
        {activeTab === 'gpu' && !loading && (
          <motion.div
            key="gpu"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* GPU Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="text-sm text-muted-foreground mb-1">Total GPUs</div>
                <div className="text-3xl font-bold text-foreground">{state.gpuUtilization.length}</div>
              </div>
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="text-sm text-muted-foreground mb-1">Avg Utilization</div>
                <div className="text-3xl font-bold text-foreground">
                  {state.gpuUtilization.length > 0
                    ? (state.gpuUtilization.reduce((sum, g) => sum + g.utilizationPercent, 0) / state.gpuUtilization.length).toFixed(1)
                    : 0}%
                </div>
              </div>
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="text-sm text-muted-foreground mb-1">High Utilization</div>
                <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                  {state.gpuUtilization.filter((g) => g.utilizationPercent >= 70).length}
                </div>
              </div>
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="text-sm text-muted-foreground mb-1">Idle GPUs</div>
                <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  {state.gpuUtilization.filter((g) => g.utilizationPercent < 30).length}
                </div>
              </div>
            </div>

            {/* GPU Utilization Chart */}
            <div className="rounded-xl border border-border bg-card p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-foreground">GPU Utilization by Instance</h3>
                  <p className="text-sm text-muted-foreground">Real-time utilization percentage</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-emerald-500" />
                    <span className="text-muted-foreground">&lt;30%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-amber-500" />
                    <span className="text-muted-foreground">30-70%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-red-500" />
                    <span className="text-muted-foreground">&gt;70%</span>
                  </div>
                </div>
              </div>
              {state.gpuUtilization.length > 0 ? (
                <GpuUtilizationChart data={state.gpuUtilization} height={300} />
              ) : (
                <div className="flex flex-col items-center justify-center py-16">
                  <Cpu className="w-12 h-12 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No GPU data available</p>
                </div>
              )}
            </div>

            {/* GPU Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {state.gpuUtilization.map((gpu, index) => (
                <motion.div
                  key={gpu.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="p-4 rounded-xl border border-border bg-card hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-medium text-foreground text-sm truncate max-w-[140px]">
                        {gpu.instanceName || gpu.id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {gpu.gpuType} • {gpu.memoryGb}GB
                      </div>
                    </div>
                    <div className={cn(
                      "text-2xl font-bold",
                      gpu.utilizationPercent < 30 ? "text-emerald-600 dark:text-emerald-400" :
                      gpu.utilizationPercent < 70 ? "text-amber-600 dark:text-amber-400" :
                      "text-red-600 dark:text-red-400"
                    )}>
                      {gpu.utilizationPercent.toFixed(0)}%
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className={cn(
                      "px-2 py-0.5 rounded font-medium",
                      gpu.status === 'available' ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400" :
                      gpu.status === 'leased' ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400" :
                      "bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-400"
                    )}>
                      {gpu.status}
                    </span>
                    <span className="text-muted-foreground">GPU #{gpu.gpuIndex}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${gpu.utilizationPercent}%` }}
                      transition={{ duration: 0.5, delay: index * 0.05 }}
                      className={cn(
                        "h-full rounded-full",
                        gpu.utilizationPercent < 30 ? "bg-emerald-500" :
                        gpu.utilizationPercent < 70 ? "bg-amber-500" : "bg-red-500"
                      )}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Cost Analytics Tab */}
        {activeTab === 'costs' && !loading && (
          <motion.div
            key="costs"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* Cost Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="p-5 rounded-xl border border-border bg-card">
                <div className="text-sm text-muted-foreground mb-1">Baseline Cost</div>
                <div className="text-2xl font-bold text-foreground">
                  ${state.costAnalytics.totalBaselineCostUsd.toFixed(4)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">On-demand pricing</div>
              </div>
              <div className="p-5 rounded-xl border border-border bg-card">
                <div className="text-sm text-muted-foreground mb-1">Actual Cost</div>
                <div className="text-2xl font-bold text-foreground">
                  ${state.costAnalytics.totalActualCostUsd.toFixed(4)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">With Xid-R optimization</div>
              </div>
              <div className="p-5 rounded-xl border border-border bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900">
                <div className="text-sm text-emerald-700 dark:text-emerald-300 mb-1">Total Saved</div>
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  ${state.costAnalytics.totalSavingsUsd.toFixed(4)}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <ArrowUpRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    {state.costAnalytics.savingsPercent.toFixed(1)}% savings rate
                  </span>
                </div>
              </div>
              <div className="p-5 rounded-xl border border-border bg-card">
                <div className="text-sm text-muted-foreground mb-1">Savings Rate</div>
                <div className="text-2xl font-bold text-foreground">
                  {state.costAnalytics.savingsPercent.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">vs baseline pricing</div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              {/* Daily Savings */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">Daily Savings</h3>
                    <p className="text-sm text-muted-foreground">Cost savings per day</p>
                  </div>
                </div>
                <SavingsAreaChart data={state.costAnalytics.daily} height={250} />
              </div>

              {/* Hourly Trend */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">Hourly Trend</h3>
                    <p className="text-sm text-muted-foreground">Savings by hour</p>
                  </div>
                </div>
                <CostComparisonChart hourly={state.costAnalytics.hourly} height={250} />
              </div>
            </div>

            {/* Tenant Cost Breakdown */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-foreground">Tenant Cost Breakdown</h3>
                  <p className="text-sm text-muted-foreground">Savings by tenant</p>
                </div>
              </div>
              {state.tenantBreakdown.length > 0 ? (
                <div className="space-y-3">
                  {state.tenantBreakdown.map((tenant, index) => {
                    const percentage = state.costAnalytics.totalSavingsUsd > 0
                      ? (tenant.totalSavingsUsd / state.costAnalytics.totalSavingsUsd) * 100
                      : 0;
                    return (
                      <motion.div
                        key={tenant.tenantId}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        className="p-4 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium text-foreground">{tenant.tenantName}</div>
                          <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            ${tenant.totalSavingsUsd.toFixed(4)}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                          <span>{tenant.activeLeases} active / {tenant.totalLeases} total leases</span>
                          <span>{percentage.toFixed(1)}% of total</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="h-full rounded-full bg-emerald-500"
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <Users className="w-12 h-12 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No tenant data available</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Checkpoints Tab */}
        {activeTab === 'checkpoints' && !loading && (
          <motion.div
            key="checkpoints"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* Checkpoint Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="p-5 rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total</span>
                </div>
                <div className="text-3xl font-bold text-foreground">
                  {state.checkpointAnalytics.total}
                </div>
              </div>
              <div className="p-5 rounded-xl border border-border bg-emerald-50 dark:bg-emerald-950">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm text-emerald-700 dark:text-emerald-300">Success Rate</span>
                </div>
                <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">
                  {state.checkpointAnalytics.successRate.toFixed(1)}%
                </div>
              </div>
              <div className="p-5 rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Avg Duration</span>
                </div>
                <div className="text-3xl font-bold text-foreground">
                  {formatDuration(state.checkpointAnalytics.avgDurationMs)}
                </div>
              </div>
              <div className="p-5 rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Avg Size</span>
                </div>
                <div className="text-3xl font-bold text-foreground">
                  {formatBytes(state.checkpointAnalytics.avgSizeBytes)}
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              {/* Donut Chart */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">Checkpoint Status</h3>
                    <p className="text-sm text-muted-foreground">Distribution by status</p>
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <CheckpointDonutChart
                    complete={state.checkpointAnalytics.complete}
                    restored={state.checkpointAnalytics.restored}
                    failed={state.checkpointAnalytics.failed}
                    height={220}
                  />
                </div>
                <div className="flex items-center justify-center gap-6 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-sm text-muted-foreground">Complete ({state.checkpointAnalytics.complete})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-sm text-muted-foreground">Restored ({state.checkpointAnalytics.restored})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-sm text-muted-foreground">Failed ({state.checkpointAnalytics.failed})</span>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">Performance Metrics</h3>
                    <p className="text-sm text-muted-foreground">Checkpoint performance stats</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="text-sm text-muted-foreground mb-1">Complete</div>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {state.checkpointAnalytics.complete}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="text-sm text-muted-foreground mb-1">Restored</div>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {state.checkpointAnalytics.restored}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="text-sm text-muted-foreground mb-1">Failed</div>
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {state.checkpointAnalytics.failed}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="text-sm text-muted-foreground mb-1">Total Size</div>
                    <div className="text-2xl font-bold text-foreground">
                      {formatBytes(state.checkpointAnalytics.avgSizeBytes * state.checkpointAnalytics.total)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Checkpoints Table */}
            <div className="rounded-xl border border-border bg-card">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-semibold text-foreground">Recent Checkpoints</h3>
              </div>
              <div className="p-5">
                {state.checkpointAnalytics.recentCheckpoints.length > 0 ? (
                  <div className="space-y-3">
                    {state.checkpointAnalytics.recentCheckpoints.map((ckpt, index) => (
                      <motion.div
                        key={ckpt.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                        className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            ckpt.status === 'complete' ? "bg-emerald-50 dark:bg-emerald-950" :
                            ckpt.status === 'restored' ? "bg-blue-50 dark:bg-blue-950" :
                            "bg-red-50 dark:bg-red-950"
                          )}>
                            {ckpt.status === 'complete' ? (
                              <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            ) : ckpt.status === 'restored' ? (
                              <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                            )}
                          </div>
                          <div>
                            <div className="font-mono text-sm text-foreground">{ckpt.leaseId}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(ckpt.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <div className="text-sm font-medium text-foreground">{formatBytes(ckpt.sizeBytes)}</div>
                            <div className="text-xs text-muted-foreground">Size</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-foreground">{formatDuration(ckpt.durationMs)}</div>
                            <div className="text-xs text-muted-foreground">Duration</div>
                          </div>
                          <span className={cn(
                            "px-2 py-1 rounded text-xs font-medium",
                            ckpt.status === 'complete' ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400" :
                            ckpt.status === 'restored' ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400" :
                            "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400"
                          )}>
                            {ckpt.status}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Database className="w-12 h-12 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No recent checkpoints</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

export default MetricsPage;
