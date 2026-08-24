import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Cpu, Clock, MoreVertical, ExternalLink } from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';

interface Lease {
  id: string;
  status: string;
  agentId: string;
  gpuType: string;
  capacityLane: string | null;
  grantedAt: string | null;
}

interface ActiveLeasesProps {
  leases: Lease[];
}

const statusColors: Record<string, { badge: string; dot: string }> = {
  active: { badge: "success", dot: "bg-green-400" },
  pending: { badge: "warning", dot: "bg-yellow-400" },
  negotiating: { badge: "info", dot: "bg-orange-400" },
  checkpointing: { badge: "info", dot: "bg-purple-400" },
  resuming: { badge: "info", dot: "bg-blue-400" },
};

export function ActiveLeases({ leases }: ActiveLeasesProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold">Active Leases</CardTitle>
        <Button variant="ghost" size="sm">
          View All
          <ExternalLink className="w-4 h-4 ml-1" />
        </Button>
      </CardHeader>
      <CardContent>
        {leases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Cpu className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No active leases</p>
            <p className="text-xs text-muted-foreground mt-1">
              Leases will appear here when agents request GPUs
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {leases.map((lease) => {
              const status = statusColors[lease.status] || statusColors.pending;

              return (
                <div
                  key={lease.id}
                  className="group relative p-4 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {/* Status indicator */}
                      <div className="relative mt-1">
                        <div className={cn("w-2 h-2 rounded-full", status.dot)} />
                        <div className={cn("absolute inset-0 w-2 h-2 rounded-full animate-ping", status.dot, "opacity-75")} />
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm text-cyan-400">{lease.id}</span>
                          <Badge variant={status.badge as "success" | "warning" | "info"} className="text-xs">
                            {lease.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Agent: <span className="text-white">{lease.agentId}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Cpu className="w-3 h-3" />
                            {lease.gpuType}
                          </span>
                          {lease.capacityLane && (
                            <span className="px-2 py-0.5 rounded bg-white/5">
                              {lease.capacityLane}
                            </span>
                          )}
                          {lease.grantedAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {timeAgo(lease.grantedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Progress bar for checkpointing status */}
                  {lease.status === 'checkpointing' && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-purple-400">Checkpointing...</span>
                        <span className="text-muted-foreground">47s remaining</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-purple-500/20 overflow-hidden">
                        <div className="h-full w-1/2 bg-purple-500 animate-pulse" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
