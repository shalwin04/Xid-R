
import { Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

const plans = [
  {
    name: "Starter",
    description: "For teams getting started with GPU optimization",
    price: "Free",
    period: "",
    features: [
      "Up to 5 GPU leases",
      "Basic scheduling",
      "Community support",
      "Dashboard access",
      "7-day audit logs",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    description: "For teams with significant GPU workloads",
    price: "15%",
    period: "gain-share",
    features: [
      "Unlimited GPU leases",
      "Priority scheduling",
      "A2A negotiation",
      "Full checkpoint SDK",
      "30-day audit logs",
      "Email support",
      "Custom integrations",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    description: "For organizations with enterprise requirements",
    price: "Custom",
    period: "",
    features: [
      "Everything in Pro",
      "Dedicated capacity pools",
      "SLA guarantees",
      "On-prem support",
      "Compliance certifications",
      "24/7 support",
      "Custom contracts",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-t from-orange-500/5 to-transparent" />

      <div className="max-w-7xl mx-auto px-6 relative">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium mb-4">
            Pricing
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-normal text-white mb-4">
            Pay Only for What You Save
          </h2>
          <p className="text-lg text-muted-foreground">
            Gain-share pricing means we only win when you save money on GPU compute.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative p-8 rounded-2xl transition-all ${
                plan.highlighted
                  ? 'bg-gradient-to-b from-orange-500/20 via-amber-500/10 to-card border-2 border-orange-500/50 shadow-[0_0_40px_rgba(249,115,22,0.2)]'
                  : 'bg-card border border-border hover:border-white/20'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-medium flex items-center gap-1">
                  <Sparkles className="w-4 h-4" />
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-semibold text-white mb-2">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold text-white">{plan.price}</span>
                {plan.period && (
                  <span className="text-muted-foreground ml-2">{plan.period}</span>
                )}
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="w-full"
                variant={plan.highlighted ? "glow" : "outline"}
                size="lg"
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>

        {/* Savings calculator teaser */}
        <div className="mt-16 p-8 rounded-2xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 border border-white/10 text-center">
          <h3 className="text-2xl font-semibold text-white mb-2">
            Calculate Your Savings
          </h3>
          <p className="text-muted-foreground mb-4">
            On average, teams save 70% on GPU compute costs by harvesting idle capacity.
          </p>
          <div className="flex items-center justify-center gap-4 text-sm">
            <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
              <span className="text-muted-foreground">Before Xid-R:</span>
              <span className="ml-2 font-semibold text-white">$10,000/mo</span>
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/30">
              <span className="text-green-400">After Xid-R:</span>
              <span className="ml-2 font-semibold text-green-400">$3,000/mo</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
