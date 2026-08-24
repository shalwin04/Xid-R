
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  AlertTriangle,
  Cpu,
  Download,
  Play,
  Clock,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';

interface Event {
  id: string;
  type: string;
  timestamp: string;
  summary: string;
  leaseId: string | null;
}

interface EventsFeedProps {
  events: Event[];
}

const eventIcons: Record<string, typeof CheckCircle> = {
  lease_granted: CheckCircle,
  lease_requested: Clock,
  reclaim_initiated: AlertTriangle,
  checkpoint_completed: Download,
  resume_completed: Play,
  lease_released: CheckCircle,
  capacity_discovered: Cpu,
};

const eventColors: Record<string, string> = {
  lease_granted: 'text-green-400 bg-green-500/10',
  lease_requested: 'text-blue-400 bg-blue-500/10',
  reclaim_initiated: 'text-orange-400 bg-orange-500/10',
  checkpoint_completed: 'text-purple-400 bg-purple-500/10',
  resume_completed: 'text-cyan-400 bg-cyan-500/10',
  lease_released: 'text-gray-400 bg-gray-500/10',
  capacity_discovered: 'text-yellow-400 bg-yellow-500/10',
};

export function EventsFeed({ events }: EventsFeedProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold">Recent Events</CardTitle>
        <Button variant="ghost" size="sm">
          View All
          <ExternalLink className="w-4 h-4 ml-1" />
        </Button>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Clock className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No recent events</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gradient-to-b from-cyan-500/50 via-purple-500/50 to-transparent" />

            <div className="space-y-4">
              {events.map((event) => {
                const Icon = eventIcons[event.type] || Clock;
                const colorClass = eventColors[event.type] || 'text-gray-400 bg-gray-500/10';
                const [iconColor, bgColor] = colorClass.split(' ');

                return (
                  <div key={event.id} className="relative flex gap-4 group">
                    {/* Icon */}
                    <div className={cn(
                      "relative z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
                      bgColor
                    )}>
                      <Icon className={cn("w-4 h-4", iconColor)} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white">
                          {event.type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(event.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {event.summary}
                      </p>
                      {event.leaseId && (
                        <button className="inline-flex items-center gap-1 mt-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                          <span className="font-mono">{event.leaseId}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
