
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Cpu, Server, Cloud, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CapacityOverviewProps {
  capacity: {
    total: number;
    available: number;
    leased: number;
    byGpuType: Record<string, { total: number; available: number }>;
  };
}

const gpuTypeIcons: Record<string, typeof Cpu> = {
  'nvidia-t4': Cpu,
  'nvidia-l4': Server,
  'nvidia-a100-40gb': Zap,
  'nvidia-a100-80gb': Zap,
};

const gpuTypeColors: Record<string, string> = {
  'nvidia-t4': 'bg-blue-500',
  'nvidia-l4': 'bg-purple-500',
  'nvidia-a100-40gb': 'bg-cyan-500',
  'nvidia-a100-80gb': 'bg-green-500',
};

export function CapacityOverview({ capacity }: CapacityOverviewProps) {
  const utilizationPercent = capacity.total > 0
    ? Math.round((capacity.leased / capacity.total) * 100)
    : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold">Capacity Overview</CardTitle>
        <Badge variant={capacity.available > 0 ? "success" : "warning"}>
          {capacity.available} Available
        </Badge>
      </CardHeader>
      <CardContent>
        {/* Main capacity bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Utilization</span>
            <span className="font-medium text-white">{utilizationPercent}%</span>
          </div>
          <div className="relative h-4 rounded-full bg-secondary overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-500"
              style={{ width: `${utilizationPercent}%` }}
            />
            {/* Stripes for visual interest */}
            <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_10px,rgba(255,255,255,0.05)_10px,rgba(255,255,255,0.05)_20px)]" />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>{capacity.leased} leased</span>
            <span>{capacity.total} total</span>
          </div>
        </div>

        {/* GPU type breakdown */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">By GPU Type</h4>
          {Object.entries(capacity.byGpuType).map(([gpuType, stats]) => {
            const Icon = gpuTypeIcons[gpuType] || Cpu;
            const color = gpuTypeColors[gpuType] || 'bg-gray-500';
            const usage = stats.total > 0 ? ((stats.total - stats.available) / stats.total) * 100 : 0;

            return (
              <div key={gpuType} className="flex items-center gap-4">
                <div className={cn("p-2 rounded-lg", color, "bg-opacity-20")}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white font-medium">{gpuType}</span>
                    <span className="text-muted-foreground">
                      {stats.available}/{stats.total}
                    </span>
                  </div>
                  <Progress value={usage} className="h-2" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Capacity sources */}
        <div className="mt-6 pt-4 border-t border-border">
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Sources</h4>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "GKE", icon: Server, count: 2 },
              { label: "Spot VM", icon: Cloud, count: 1 },
              { label: "Cloud Run", icon: Zap, count: 1 },
            ].map((source, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10"
              >
                <source.icon className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">{source.label}</div>
                  <div className="text-sm font-medium text-white">{source.count}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
