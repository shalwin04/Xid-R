
import { Card, CardContent } from '@/components/ui/card';
import { Cpu, Clock, DollarSign, CheckCircle, TrendingUp, Activity } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';

interface StatsCardsProps {
  stats: {
    activeLeases: number;
    pendingRequests: number;
    totalSavingsUsd: number;
    checkpointsCompleted: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      label: "Active Leases",
      value: stats.activeLeases.toString(),
      icon: Cpu,
      color: "from-cyan-500 to-blue-600",
      bgColor: "bg-cyan-500/10",
      borderColor: "border-cyan-500/30",
      trend: "+2 from last hour",
      trendUp: true,
    },
    {
      label: "Pending Requests",
      value: stats.pendingRequests.toString(),
      icon: Clock,
      color: "from-yellow-500 to-orange-600",
      bgColor: "bg-yellow-500/10",
      borderColor: "border-yellow-500/30",
      trend: "Queue processing",
      trendUp: null,
    },
    {
      label: "Total Savings",
      value: formatCurrency(stats.totalSavingsUsd),
      icon: DollarSign,
      color: "from-green-500 to-emerald-600",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/30",
      trend: "+$0.42 today",
      trendUp: true,
    },
    {
      label: "Checkpoints",
      value: stats.checkpointsCompleted.toString(),
      icon: CheckCircle,
      color: "from-purple-500 to-pink-600",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/30",
      trend: "100% success rate",
      trendUp: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <Card
          key={index}
          className={cn(
            "relative overflow-hidden border",
            card.borderColor
          )}
        >
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{card.label}</p>
                <p className="text-3xl font-bold text-white">{card.value}</p>
                {card.trend && (
                  <div className="flex items-center gap-1 mt-2">
                    {card.trendUp !== null && (
                      <TrendingUp
                        className={cn(
                          "w-3 h-3",
                          card.trendUp ? "text-green-400" : "text-red-400"
                        )}
                      />
                    )}
                    {card.trendUp === null && (
                      <Activity className="w-3 h-3 text-yellow-400" />
                    )}
                    <span className="text-xs text-muted-foreground">{card.trend}</span>
                  </div>
                )}
              </div>
              <div className={cn("p-3 rounded-xl", card.bgColor)}>
                <card.icon className={cn("w-6 h-6 bg-gradient-to-br bg-clip-text", card.color)} style={{ color: 'inherit' }} />
              </div>
            </div>

            {/* Decorative gradient */}
            <div className={cn(
              "absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r",
              card.color
            )} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
