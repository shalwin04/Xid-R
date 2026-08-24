import { useState } from 'react';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Wifi,
  Globe,
  Sun,
  Moon,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/layout';
import { useTheme } from '@/contexts/theme-context';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface HealthStatus {
  api: boolean;
  websocket: boolean;
  version: string | null;
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [health, setHealth] = useState<HealthStatus>({ api: false, websocket: false, version: null });
  const [checking, setChecking] = useState(false);

  const checkHealth = async () => {
    setChecking(true);
    const newHealth: HealthStatus = { api: false, websocket: false, version: null };

    try {
      const result = await api.healthCheck();
      newHealth.api = result.status === 'ok';
      newHealth.version = result.version;
    } catch {
      newHealth.api = false;
    }

    try {
      const ws = new WebSocket(`ws://${window.location.hostname}:8081`);
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => {
          newHealth.websocket = true;
          ws.close();
          resolve();
        };
        ws.onerror = () => {
          reject();
        };
        setTimeout(() => reject(), 3000);
      });
    } catch {
      newHealth.websocket = false;
    }

    setHealth(newHealth);
    setChecking(false);
  };

  return (
    <DashboardLayout title="Settings" subtitle="Configure and monitor system health">
      <div className="max-w-3xl">
        {/* Appearance */}
        <div className="rounded-xl border border-border bg-card mb-6">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Appearance</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Customize how the dashboard looks</p>
          </div>
          <div className="p-5">
            <div className="flex gap-4">
              <button
                onClick={() => setTheme('light')}
                className={cn(
                  "flex-1 p-4 rounded-lg border-2 transition-all",
                  theme === 'light' ? "border-foreground" : "border-border hover:border-border/80"
                )}
              >
                <div className="w-full h-24 rounded-lg bg-white border border-gray-200 mb-3 flex items-center justify-center">
                  <Sun className="w-8 h-8 text-amber-500" />
                </div>
                <div className="text-sm font-medium text-foreground">Light</div>
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={cn(
                  "flex-1 p-4 rounded-lg border-2 transition-all",
                  theme === 'dark' ? "border-foreground" : "border-border hover:border-border/80"
                )}
              >
                <div className="w-full h-24 rounded-lg bg-gray-900 border border-gray-700 mb-3 flex items-center justify-center">
                  <Moon className="w-8 h-8 text-blue-400" />
                </div>
                <div className="text-sm font-medium text-foreground">Dark</div>
              </button>
            </div>
          </div>
        </div>

        {/* System Health */}
        <div className="rounded-xl border border-border bg-card mb-6">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">System Health</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Check connection status</p>
            </div>
            <button
              onClick={checkHealth}
              disabled={checking}
              className="h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium flex items-center gap-2 hover:bg-foreground/90 transition-colors"
            >
              <RefreshCw className={cn("w-4 h-4", checking && "animate-spin")} />
              Check Health
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Globe className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">API Server</div>
                  <div className="text-xs text-muted-foreground">http://localhost:8080</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {health.version && (
                  <span className="px-2 py-1 rounded bg-muted text-xs text-foreground">v{health.version}</span>
                )}
                <span className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                  health.api
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                    : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
                )}>
                  {health.api ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {health.api ? 'Connected' : 'Offline'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Wifi className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">WebSocket</div>
                  <div className="text-xs text-muted-foreground">ws://localhost:8081</div>
                </div>
              </div>
              <span className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                health.websocket
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
              )}>
                {health.websocket ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {health.websocket ? 'Connected' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Configuration */}
        <div className="rounded-xl border border-border bg-card mb-6">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Configuration</h2>
          </div>
          <div className="p-5">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted">
                <div className="text-xs text-muted-foreground mb-1">API Endpoint</div>
                <div className="text-sm font-mono text-foreground">/api</div>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <div className="text-xs text-muted-foreground mb-1">MCP Tools</div>
                <div className="text-sm font-mono text-foreground">/mcp/tools</div>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <div className="text-xs text-muted-foreground mb-1">WebSocket Port</div>
                <div className="text-sm font-mono text-foreground">8081</div>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <div className="text-xs text-muted-foreground mb-1">Frontend Port</div>
                <div className="text-sm font-mono text-foreground">3000</div>
              </div>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="rounded-xl border border-border bg-card">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">About Xid-R</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-muted-foreground mb-4">
              Xid-R is an agentic GPU compute broker that matches idle GPU capacity to agent demand.
              It uses MCP for tool integration and A2A protocol for checkpoint/resume negotiation.
            </p>
            <div className="flex gap-2">
              <span className="px-3 py-1 rounded-full bg-muted text-xs font-medium text-foreground">
                MCP Compatible
              </span>
              <span className="px-3 py-1 rounded-full bg-muted text-xs font-medium text-foreground">
                A2A Protocol
              </span>
              <span className="px-3 py-1 rounded-full bg-muted text-xs font-medium text-foreground">
                GCP Native
              </span>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default SettingsPage;
