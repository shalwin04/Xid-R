
import {
  Cpu,
  Zap,
  Shield,
  BarChart3,
  RefreshCw,
  MessageSquare,
  Clock,
  DollarSign
} from 'lucide-react';

const features = [
  {
    icon: Cpu,
    title: "Intelligent Capacity Discovery",
    description: "Automatically discovers and tracks GPU resources from GKE, Spot VMs, and Cloud Run with real-time utilization monitoring.",
    color: "from-orange-500 to-amber-600"
  },
  {
    icon: Zap,
    title: "MCP Tool Integration",
    description: "Native Model Context Protocol support. Agents request GPUs with xidr_request_gpu and release with xidr_release.",
    color: "from-amber-500 to-yellow-600"
  },
  {
    icon: RefreshCw,
    title: "A2A Negotiation",
    description: "Agent-to-Agent protocol for graceful preemption. Negotiate checkpoint, migrate, or accept loss in real-time.",
    color: "from-rose-500 to-orange-600"
  },
  {
    icon: Shield,
    title: "Cooperative Checkpointing",
    description: "SDK for agents to save and restore state. JSON-based state serialization with GCS storage.",
    color: "from-amber-600 to-orange-700"
  },
  {
    icon: BarChart3,
    title: "Full Explainability",
    description: "xidr_explain provides detailed reasoning for every scheduling decision. Complete audit trail in Firestore.",
    color: "from-orange-600 to-red-600"
  },
  {
    icon: MessageSquare,
    title: "Real-time Dashboard",
    description: "Live WebSocket updates for capacity, leases, and events. Monitor savings and utilization in real-time.",
    color: "from-yellow-500 to-amber-600"
  },
];

const stats = [
  { icon: Clock, label: "Avg Checkpoint", value: "47s" },
  { icon: DollarSign, label: "Cost Reduction", value: "70%" },
  { icon: Cpu, label: "GPU Types", value: "4+" },
  { icon: Zap, label: "Latency", value: "<100ms" },
];

export function Features() {
  return (
    <section id="features" className="py-24 bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-orange-500/5 via-transparent to-amber-500/5" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-orange-500/10 to-transparent rounded-full blur-3xl" />

      <div className="max-w-7xl mx-auto px-6 relative">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-medium mb-4">
            Features
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-normal text-white mb-4">
            Built for AI Agent Workloads
          </h2>
          <p className="text-lg text-muted-foreground">
            Everything you need to efficiently manage GPU capacity for autonomous AI agents.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group relative p-6 rounded-2xl bg-card border border-border hover:border-orange-500/50 transition-all duration-300"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm">{feature.description}</p>

              {/* Hover glow effect */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-orange-500/0 to-amber-500/0 group-hover:from-orange-500/5 group-hover:to-amber-500/5 transition-all duration-300" />
            </div>
          ))}
        </div>

        {/* Stats bar */}
        <div className="mt-20 p-8 rounded-2xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 border border-white/10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/5 mb-3">
                  <stat.icon className="w-6 h-6 text-orange-400" />
                </div>
                <div className="text-3xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
