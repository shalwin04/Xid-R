"use client";

import React, { useState } from 'react';
import { Menu, ArrowUpRight, ArrowRight, Play } from 'lucide-react';

interface NavLink {
    label: string;
    href: string;
    isActive?: boolean;
}

interface Partner {
    name: string;
    logoUrl?: string;
    href: string;
}

interface ResponsiveHeroBannerProps {
    logoUrl?: string;
    backgroundImageUrl?: string;
    navLinks?: NavLink[];
    ctaButtonText?: string;
    ctaButtonHref?: string;
    badgeText?: string;
    badgeLabel?: string;
    title?: string;
    titleLine2?: string;
    description?: string;
    primaryButtonText?: string;
    primaryButtonHref?: string;
    secondaryButtonText?: string;
    secondaryButtonHref?: string;
    partnersTitle?: string;
    partners?: Partner[];
}

const ResponsiveHeroBanner: React.FC<ResponsiveHeroBannerProps> = ({
    logoUrl: _logoUrl,
    navLinks = [
        { label: "Home", href: "#", isActive: true },
        { label: "Features", href: "#features" },
        { label: "Dashboard", href: "/dashboard" },
        { label: "Docs", href: "#docs" },
        { label: "Pricing", href: "#pricing" }
    ],
    ctaButtonText = "Get Started",
    ctaButtonHref = "/dashboard",
    badgeLabel = "New",
    badgeText = "Agentic GPU Compute Broker",
    title = "Every Idle Cycle,",
    titleLine2 = "Checkpointed",
    description = "Harvest idle GPU capacity and broker it to AI agents. MCP tools for requests, A2A protocol for checkpoint negotiation. Full explainability for every decision.",
    primaryButtonText = "Launch Dashboard",
    primaryButtonHref = "/dashboard",
    secondaryButtonText = "Watch Demo",
    secondaryButtonHref = "#demo",
    partnersTitle = "Trusted by leading AI teams and enterprises",
    partners = [
        { name: "Google Cloud", href: "#" },
        { name: "NVIDIA", href: "#" },
        { name: "Anthropic", href: "#" },
        { name: "OpenAI", href: "#" },
        { name: "Vercel", href: "#" }
    ]
}) => {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <section className="w-full isolate min-h-screen overflow-hidden relative bg-[#0a0a0a]">
            {/* Gradient orb effect */}
            <div className="absolute top-0 right-0 w-[800px] h-[800px] opacity-60">
                <div className="absolute inset-0 bg-gradient-radial from-orange-500/40 via-orange-600/20 to-transparent blur-3xl" />
            </div>
            <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] opacity-40">
                <div className="absolute inset-0 bg-gradient-radial from-amber-500/30 via-red-500/10 to-transparent blur-2xl" />
            </div>

            {/* Subtle grid pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

            <header className="z-10 relative">
                <div className="mx-6">
                    <div className="flex items-center justify-between pt-4">
                        <a
                            href="#"
                            className="inline-flex items-center gap-2 text-2xl font-bold text-white"
                        >
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center">
                                <span className="text-white font-bold">X</span>
                            </div>
                            <span className="hidden sm:inline">Xid-R</span>
                        </a>

                        <nav className="hidden md:flex items-center gap-2">
                            <div className="flex items-center gap-1 rounded-full bg-white/5 px-1 py-1 ring-1 ring-white/10 backdrop-blur">
                                {navLinks.map((link, index) => (
                                    <a
                                        key={index}
                                        href={link.href}
                                        className={`px-3 py-2 text-sm font-medium hover:text-white font-sans transition-colors ${link.isActive ? 'text-white/90' : 'text-white/70'
                                            }`}
                                    >
                                        {link.label}
                                    </a>
                                ))}
                                <a
                                    href={ctaButtonHref}
                                    className="ml-1 inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 hover:bg-white/90 font-sans transition-colors"
                                >
                                    {ctaButtonText}
                                    <ArrowUpRight className="h-4 w-4" />
                                </a>
                            </div>
                        </nav>

                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15 backdrop-blur"
                            aria-expanded={mobileMenuOpen}
                            aria-label="Toggle menu"
                        >
                            <Menu className="h-5 w-5 text-white/90" />
                        </button>
                    </div>

                    {/* Mobile menu */}
                    {mobileMenuOpen && (
                        <div className="md:hidden mt-4 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/10 p-4">
                            {navLinks.map((link, index) => (
                                <a
                                    key={index}
                                    href={link.href}
                                    className="block px-4 py-3 text-white/80 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                                >
                                    {link.label}
                                </a>
                            ))}
                            <a
                                href={ctaButtonHref}
                                className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium text-neutral-900"
                            >
                                {ctaButtonText}
                                <ArrowUpRight className="h-4 w-4" />
                            </a>
                        </div>
                    )}
                </div>
            </header>

            <div className="z-10 relative">
                <div className="sm:pt-28 md:pt-32 lg:pt-40 max-w-7xl mx-auto pt-28 px-6 pb-16">
                    <div className="mx-auto max-w-3xl text-center">
                        <div className="mb-6 inline-flex items-center gap-3 rounded-full bg-white/5 px-2.5 py-2 ring-1 ring-white/10 backdrop-blur animate-fade-slide-in-1">
                            <span className="inline-flex items-center text-xs font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-full py-0.5 px-2 font-sans">
                                {badgeLabel}
                            </span>
                            <span className="text-sm font-medium text-white/80 font-sans">
                                {badgeText}
                            </span>
                        </div>

                        <h1 className="sm:text-5xl md:text-6xl lg:text-7xl leading-tight text-4xl text-white tracking-tight font-serif font-normal italic animate-fade-slide-in-2">
                            {title}
                            <br className="hidden sm:block" />
                            <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500 bg-clip-text text-transparent">
                                {titleLine2}
                            </span>
                        </h1>

                        <p className="sm:text-lg animate-fade-slide-in-3 text-base text-white/60 max-w-2xl mt-6 mx-auto leading-relaxed">
                            {description}
                        </p>

                        <div className="flex flex-col sm:flex-row sm:gap-4 mt-10 gap-3 items-center justify-center animate-fade-slide-in-4">
                            <a
                                href={primaryButtonHref}
                                className="inline-flex items-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 rounded-full py-3 px-6 font-sans transition-all shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)]"
                            >
                                {primaryButtonText}
                                <ArrowRight className="h-4 w-4" />
                            </a>
                            <a
                                href={secondaryButtonHref}
                                className="inline-flex items-center gap-2 rounded-full bg-white/5 ring-1 ring-white/15 px-5 py-3 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white font-sans transition-colors"
                            >
                                {secondaryButtonText}
                                <Play className="w-4 h-4" />
                            </a>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-8 mt-16 animate-fade-slide-in-4">
                            <div className="text-center">
                                <div className="text-3xl sm:text-4xl font-bold text-white">95%</div>
                                <div className="text-sm text-white/50 mt-1">GPU Utilization</div>
                            </div>
                            <div className="text-center">
                                <div className="text-3xl sm:text-4xl font-bold text-white">70%</div>
                                <div className="text-sm text-white/50 mt-1">Cost Savings</div>
                            </div>
                            <div className="text-center">
                                <div className="text-3xl sm:text-4xl font-bold text-white">&lt;1s</div>
                                <div className="text-sm text-white/50 mt-1">Checkpoint Time</div>
                            </div>
                        </div>
                    </div>

                    <div className="mx-auto mt-20 max-w-5xl">
                        <p className="animate-fade-slide-in-1 text-sm text-white/50 text-center">
                            {partnersTitle}
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 animate-fade-slide-in-2 text-white/70 mt-6 items-center justify-items-center gap-6">
                            {partners.map((partner, index) => (
                                <a
                                    key={index}
                                    href={partner.href}
                                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white/80 hover:bg-white/10 transition-all font-medium text-sm italic font-serif"
                                >
                                    {partner.name}
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ResponsiveHeroBanner;
