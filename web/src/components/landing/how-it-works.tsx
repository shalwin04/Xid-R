
import { ArrowRight, Cpu, MessageSquare, Download, Play } from 'lucide-react';

const steps = [
  {
    step: "01",
    icon: MessageSquare,
    title: "Request GPU",
    description: "Agent calls xidr_request_gpu MCP tool specifying GPU type, duration hint, and A2A endpoint.",
    code: `{
  "gpu_type": "nvidia-t4",
  "priority": "normal",
  "a2a_endpoint": "https://agent.run.app"
}`,
  },
  {
    step: "02",
    icon: Cpu,
    title: "Scheduler Matches",
    description: "Rule-based scheduler matches request to available capacity from GKE, Spot VMs, or Cloud Run.",
    code: `Matched to gke_mps capacity
Utilization: 12%
Grace period: 120s`,
  },
  {
    step: "03",
    icon: Download,
    title: "Preemption & Checkpoint",
    description: "On Spot preemption, Negotiator sends A2A reclaim_request. Agent checkpoints state to GCS.",
    code: `{
  "type": "reclaim_request",
  "grace_period_seconds": 120,
  "options": ["checkpoint", "migrate"]
}`,
  },
  {
    step: "04",
    icon: Play,
    title: "Resume & Continue",
    description: "Agent restores from checkpoint on new capacity. Work continues seamlessly.",
    code: `Checkpoint restored: 1.2MB
Resume time: 23s
Total downtime: 70s`,
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 bg-background relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium mb-4">
            How It Works
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-normal text-white mb-4">
            Seamless GPU Brokering
          </h2>
          <p className="text-lg text-muted-foreground">
            From request to checkpoint to resume, all handled automatically.
          </p>
        </div>

        <div className="relative">
          {/* Connection line */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500/50 via-amber-500/50 to-yellow-500/50 -translate-y-1/2" />

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                {/* Step card */}
                <div className="relative z-10 p-6 rounded-2xl bg-card border border-border hover:border-orange-500/50 transition-all group">
                  {/* Step number */}
                  <div className="absolute -top-4 left-6 px-3 py-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold">
                    {step.step}
                  </div>

                  <div className="mt-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <step.icon className="w-6 h-6 text-orange-400" />
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{step.description}</p>

                  {/* Code block */}
                  <div className="p-3 rounded-lg bg-black/50 border border-white/5 font-mono text-xs text-green-400 overflow-x-auto">
                    <pre>{step.code}</pre>
                  </div>
                </div>

                {/* Arrow between steps */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:flex absolute top-1/2 -right-4 z-20 w-8 h-8 items-center justify-center rounded-full bg-background border border-border">
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
