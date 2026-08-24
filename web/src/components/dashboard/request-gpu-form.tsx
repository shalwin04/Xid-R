import { useState } from 'react';
import { Cpu, Send, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useRequestGpu } from '@/hooks';
import { cn } from '@/lib/utils';

const GPU_TYPES = [
  { value: 'nvidia-t4', label: 'NVIDIA T4', price: '$0.35/hr' },
  { value: 'nvidia-l4', label: 'NVIDIA L4', price: '$0.70/hr' },
  { value: 'nvidia-a100-40gb', label: 'NVIDIA A100 (40GB)', price: '$2.93/hr' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low', description: 'Queue behind other requests' },
  { value: 'normal', label: 'Normal', description: 'Standard priority' },
  { value: 'high', label: 'High', description: 'Prioritize over other requests' },
];

interface RequestGpuFormProps {
  onSuccess?: () => void;
}

export function RequestGpuForm({ onSuccess }: RequestGpuFormProps) {
  const [gpuType, setGpuType] = useState('nvidia-t4');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [durationHint, setDurationHint] = useState(3600);
  const [agentId, setAgentId] = useState('web_test_agent');
  const [a2aEndpoint, setA2aEndpoint] = useState('http://localhost:9090/a2a');
  const [checkpointable, setCheckpointable] = useState(true);
  const [result, setResult] = useState<{ status: string; leaseId?: string; message?: string } | null>(null);

  const { requestGpu, loading, error } = useRequestGpu();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);

    const response = await requestGpu({
      gpu_type: gpuType,
      duration_hint_seconds: durationHint,
      priority,
      a2a_endpoint: a2aEndpoint,
      checkpointable,
      agent_id: agentId,
    });

    if (response) {
      setResult({
        status: response.status,
        leaseId: response.lease_id,
        message: response.message || (response.status === 'granted' ? 'GPU allocated!' : `Position ${response.queue_position} in queue`),
      });
      onSuccess?.();
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-lg text-white flex items-center gap-2">
          <Cpu className="w-5 h-5 text-cyan-400" />
          Request GPU
        </CardTitle>
        <CardDescription>
          Request GPU capacity via the MCP xidr_request_gpu tool
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* GPU Type */}
          <div>
            <label className="block text-sm text-muted-foreground mb-2">GPU Type</label>
            <div className="grid grid-cols-3 gap-2">
              {GPU_TYPES.map((gpu) => (
                <button
                  key={gpu.value}
                  type="button"
                  onClick={() => setGpuType(gpu.value)}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-colors",
                    gpuType === gpu.value
                      ? "bg-cyan-500/10 border-cyan-500/50 text-white"
                      : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/30"
                  )}
                >
                  <div className="text-sm font-medium">{gpu.label}</div>
                  <div className="text-xs text-muted-foreground">{gpu.price}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Priority</label>
            <div className="grid grid-cols-3 gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value as 'low' | 'normal' | 'high')}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-colors",
                    priority === p.value
                      ? "bg-cyan-500/10 border-cyan-500/50 text-white"
                      : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/30"
                  )}
                >
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Duration Hint */}
          <div>
            <label className="block text-sm text-muted-foreground mb-2">
              Duration Hint: {Math.floor(durationHint / 60)} minutes
            </label>
            <input
              type="range"
              min={300}
              max={14400}
              step={300}
              value={durationHint}
              onChange={(e) => setDurationHint(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>5 min</span>
              <span>4 hours</span>
            </div>
          </div>

          {/* Agent ID */}
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Agent ID</label>
            <input
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              placeholder="my_agent"
            />
          </div>

          {/* A2A Endpoint */}
          <div>
            <label className="block text-sm text-muted-foreground mb-2">A2A Endpoint</label>
            <input
              type="text"
              value={a2aEndpoint}
              onChange={(e) => setA2aEndpoint(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              placeholder="http://localhost:9090/a2a"
            />
          </div>

          {/* Checkpointable */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="checkpointable"
              checked={checkpointable}
              onChange={(e) => setCheckpointable(e.target.checked)}
              className="w-4 h-4 rounded border-white/30 bg-white/10 text-cyan-500 focus:ring-cyan-500/50"
            />
            <label htmlFor="checkpointable" className="text-sm text-white">
              Agent supports checkpointing
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={cn(
              "p-3 rounded-lg border text-sm flex items-center gap-2",
              result.status === 'granted'
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
            )}>
              {result.status === 'granted' ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <Clock className="w-4 h-4" />
              )}
              <div>
                <div>{result.message}</div>
                {result.leaseId && (
                  <div className="font-mono text-xs mt-1">Lease: {result.leaseId}</div>
                )}
              </div>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-500 hover:bg-cyan-600 text-white"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Requesting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Send className="w-4 h-4" />
                Request GPU
              </span>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default RequestGpuForm;
