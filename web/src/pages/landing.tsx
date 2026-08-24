
import ResponsiveHeroBanner from '@/components/ui/responsive-hero-banner';
import { Features } from '@/components/landing/features';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Pricing } from '@/components/landing/pricing';
import { Footer } from '@/components/landing/footer';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <ResponsiveHeroBanner
        badgeLabel="Hackathon"
        badgeText="All Things Agentic 2026"
        title="Every Idle Cycle,"
        titleLine2="Checkpointed"
        description="Xid-R harvests idle GPU capacity and brokers it to AI agents. MCP tools for requests, A2A protocol for checkpoint negotiation. Full explainability for every decision."
        primaryButtonText="Launch Dashboard"
        primaryButtonHref="/dashboard"
        secondaryButtonText="Watch Demo"
        secondaryButtonHref="#demo"
        ctaButtonText="Get Started"
        ctaButtonHref="/dashboard"
        partnersTitle="Built with industry-leading technologies"
        partners={[
          { name: "Google Cloud", href: "#" },
          { name: "NVIDIA", href: "#" },
          { name: "Anthropic", href: "#" },
          { name: "Hono", href: "#" },
          { name: "Firestore", href: "#" },
        ]}
      />
      <Features />
      <HowItWorks />
      <Pricing />
      <Footer />
    </div>
  );
}

export default LandingPage;
