'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';

// Color schemes
const COLORS = {
  primary: '#3b82f6',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  pink: '#ec4899',
  indigo: '#6366f1',
};


// Custom Tooltip Component
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
  formatter?: (value: number) => string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm font-medium text-foreground">
            {formatter ? formatter(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// Savings Area Chart
interface SavingsChartProps {
  data: Array<{ date: string; savingsUsd: number; leaseCount: number }>;
  height?: number;
}

export const SavingsAreaChart: React.FC<SavingsChartProps> = ({ data, height = 200 }) => {
  const chartData = data.map((d) => ({
    date: d.date,
    savings: d.savingsUsd,
    leases: d.leaseCount,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.success} stopOpacity={0.4} />
              <stop offset="100%" stopColor={COLORS.success} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(value) => {
              const date = new Date(value);
              return `${date.getMonth() + 1}/${date.getDate()}`;
            }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(value) => `$${value.toFixed(2)}`}
          />
          <Tooltip
            content={<CustomTooltip formatter={(v) => `$${v.toFixed(4)}`} />}
          />
          <Area
            type="monotone"
            dataKey="savings"
            stroke={COLORS.success}
            strokeWidth={2}
            fill="url(#savingsGradient)"
            animationDuration={1000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

// GPU Utilization Bar Chart
interface GpuUtilizationChartProps {
  data: Array<{
    id: string;
    instanceName: string | null;
    gpuType: string;
    utilizationPercent: number;
    status: string;
  }>;
  height?: number;
}

export const GpuUtilizationChart: React.FC<GpuUtilizationChartProps> = ({ data, height = 250 }) => {
  const chartData = data.slice(0, 10).map((gpu, index) => ({
    name: gpu.instanceName || `GPU ${index + 1}`,
    utilization: gpu.utilizationPercent,
    type: gpu.gpuType,
    status: gpu.status,
  }));

  const getBarColor = (utilization: number) => {
    if (utilization < 30) return COLORS.success;
    if (utilization < 70) return COLORS.warning;
    return COLORS.danger;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 30, left: 80, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(value) => `${value}%`}
          />
          <YAxis
            type="category"
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            width={75}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const data = payload[0].payload;
              return (
                <div className="bg-card border border-border rounded-lg shadow-lg p-3">
                  <p className="text-sm font-medium text-foreground">{data.name}</p>
                  <p className="text-xs text-muted-foreground">{data.type}</p>
                  <p className="text-sm font-bold mt-1" style={{ color: getBarColor(data.utilization) }}>
                    {data.utilization.toFixed(1)}% utilization
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="utilization" radius={[0, 4, 4, 0]} animationDuration={1000}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.utilization)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

// Tenant Usage Pie Chart
interface TenantPieChartProps {
  data: Array<{
    tenantName: string;
    activeLeases: number;
    totalSavingsUsd: number;
  }>;
  height?: number;
}

const PIE_COLORS = [COLORS.primary, COLORS.purple, COLORS.cyan, COLORS.pink, COLORS.indigo, COLORS.success];

export const TenantPieChart: React.FC<TenantPieChartProps> = ({ data, height = 200 }) => {
  const chartData = data.slice(0, 6).map((t) => ({
    name: t.tenantName,
    value: t.activeLeases || 1,
    savings: t.totalSavingsUsd,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={2}
            dataKey="value"
            animationDuration={1000}
          >
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const data = payload[0].payload;
              return (
                <div className="bg-card border border-border rounded-lg shadow-lg p-3">
                  <p className="text-sm font-medium text-foreground">{data.name}</p>
                  <p className="text-xs text-muted-foreground">{data.value} active leases</p>
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    ${data.savings.toFixed(4)} saved
                  </p>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

// Checkpoint Success Rate Donut
interface CheckpointDonutProps {
  complete: number;
  restored: number;
  failed: number;
  height?: number;
}

export const CheckpointDonutChart: React.FC<CheckpointDonutProps> = ({
  complete,
  restored,
  failed,
  height = 180,
}) => {
  const data = [
    { name: 'Complete', value: complete, color: COLORS.success },
    { name: 'Restored', value: restored, color: COLORS.primary },
    { name: 'Failed', value: failed, color: COLORS.danger },
  ].filter((d) => d.value > 0);

  const total = complete + restored + failed;
  const successRate = total > 0 ? ((complete + restored) / total) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="relative"
    >
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={75}
            paddingAngle={2}
            dataKey="value"
            animationDuration={1000}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const data = payload[0].payload;
              return (
                <div className="bg-card border border-border rounded-lg shadow-lg p-3">
                  <p className="text-sm font-medium text-foreground">{data.name}</p>
                  <p className="text-sm font-bold">{data.value}</p>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold text-foreground">{successRate.toFixed(0)}%</span>
        <span className="text-xs text-muted-foreground">Success</span>
      </div>
    </motion.div>
  );
};

// Cost Comparison Line Chart
interface CostComparisonChartProps {
  hourly: Array<{ hour: string; savingsUsd: number; leaseCount: number }>;
  height?: number;
}

export const CostComparisonChart: React.FC<CostComparisonChartProps> = ({ hourly, height = 200 }) => {
  const chartData = hourly.map((h) => ({
    hour: h.hour,
    savings: h.savingsUsd,
    leases: h.leaseCount,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="hour"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(value) => {
              const date = new Date(value);
              return `${date.getHours()}:00`;
            }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip
            content={<CustomTooltip formatter={(v) => `$${v.toFixed(4)}`} />}
          />
          <Line
            type="monotone"
            dataKey="savings"
            stroke={COLORS.success}
            strokeWidth={2}
            dot={false}
            animationDuration={1000}
          />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

// Node Health Status Grid
interface NodeHealthGridProps {
  nodes: Array<{
    nodeName: string;
    status: 'healthy' | 'degraded' | 'offline';
    totalUtilization: number;
    gpuCount: number;
  }>;
}

export const NodeHealthGrid: React.FC<NodeHealthGridProps> = ({ nodes }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-emerald-500';
      case 'degraded':
        return 'bg-amber-500';
      case 'offline':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="grid grid-cols-4 gap-2"
    >
      {nodes.slice(0, 12).map((node, index) => (
        <motion.div
          key={node.nodeName}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, delay: index * 0.05 }}
          className="relative group"
        >
          <div
            className={cn(
              'w-full aspect-square rounded-lg flex items-center justify-center transition-transform group-hover:scale-105',
              getStatusColor(node.status)
            )}
            style={{ opacity: 0.2 + (node.totalUtilization / 100) * 0.8 }}
          >
            <span className="text-xs font-medium text-white">{node.gpuCount}</span>
          </div>
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-foreground text-background text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
            {node.nodeName}: {node.totalUtilization}%
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
};

// Metric Card with Trend
interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: number;
  trendLabel?: string;
  icon: React.ReactNode;
  color?: 'success' | 'warning' | 'danger' | 'primary' | 'purple';
  delay?: number;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  trend,
  trendLabel,
  icon,
  color = 'primary',
  delay = 0,
}) => {
  const colorClasses = {
    success: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950',
    warning: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950',
    danger: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950',
    primary: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950',
    purple: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950',
  };

  const trendColor = trend && trend > 0 ? 'text-emerald-500' : 'text-red-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="p-4 rounded-xl border border-border bg-card"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', colorClasses[color])}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {trend !== undefined && (
        <div className="flex items-center gap-1 mt-1">
          <svg
            className={cn('w-4 h-4', trendColor)}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            {trend > 0 ? (
              <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
            )}
          </svg>
          <span className={cn('text-xs', trendColor)}>
            {Math.abs(trend).toFixed(1)}% {trendLabel || ''}
          </span>
        </div>
      )}
    </motion.div>
  );
};

// Animated Progress Ring
interface ProgressRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  percentage,
  size = 120,
  strokeWidth = 8,
  color = COLORS.primary,
  label,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="relative inline-flex items-center justify-center"
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{
            strokeDasharray: circumference,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-foreground">{percentage.toFixed(0)}%</span>
        {label && <span className="text-xs text-muted-foreground">{label}</span>}
      </div>
    </motion.div>
  );
};

export { COLORS, PIE_COLORS };
