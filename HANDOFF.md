# Xid-R Project Handoff Document

**Date:** August 26, 2026
**Project:** Xid-R - Agentic GPU Compute Broker
**Target:** All Things Agentic Hackathon (Deadline: Aug 31, 2026)

---

## Executive Summary

Xid-R is an intelligent GPU compute broker that harvests idle GPU capacity and allocates it to AI agent workloads. The system uses MCP (Model Context Protocol) for agent-to-system communication and A2A (Agent-to-Agent) protocol for negotiation during preemption events.

**Core Value Proposition:** "GKE can checkpoint a pod. Spot can preempt a VM. But nobody brokers which idle GPU goes to which agent, negotiates the handoff, and produces the audit trail. That's Xid-R."

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     TENANT AGENTS (ADK)                         │
│         Request GPUs via MCP, respond to A2A negotiation        │
└─────────────────────────────┬───────────────────────────────────┘
                              │ MCP Tools / A2A Tasks
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SELF-SERVICE SURFACE                          │
│              Cloud Run (Hono API + MCP Server)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Leases   │  │ Capacity │  │ Approvals│  │ Rule Sets    │    │
│  │ API      │  │ API      │  │ API      │  │ API          │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│                    POLICY ENGINE                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Scheduler   │  │  Negotiator  │  │  Rules Engine        │  │
│  │  Agent       │  │  Agent       │  │  Service             │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│                   CAPACITY FABRIC                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ GKE GPU  │  │ Spot VMs │  │ Cloud Run│  │ Firestore    │    │
│  │ Nodes    │  │          │  │ Workers  │  │ State        │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Completed Components

### 1. Backend API Server (`/src/`)

**Tech Stack:** Node.js, TypeScript, Hono, Firestore, Zod

#### API Routes

| Route | Description |
|-------|-------------|
| `POST /mcp/tools/xidr_request_gpu` | Request GPU capacity |
| `POST /mcp/tools/xidr_checkpoint_ack` | Acknowledge checkpoint completion |
| `POST /mcp/tools/xidr_release` | Release GPU lease |
| `GET /mcp/tools/xidr_status` | Check lease/system status |
| `POST /mcp/tools/xidr_explain` | Get decision explanation |
| `/api/leases/*` | Lease management CRUD |
| `/api/capacity/*` | Capacity unit management |
| `/api/agents/*` | Agent registration & heartbeat |
| `/api/tenants/*` | Tenant/organization management |
| `/api/rule-sets/*` | Harvesting rules CRUD |
| `/api/approvals/*` | Approval workflow management |
| `/api/onboarding/*` | 12-step onboarding wizard API |
| `/install/agent.yaml` | Kubernetes agent manifest |

#### Key Services

- **Rules Engine** (`/src/services/rules-engine.ts`)
  - `evaluateHarvesting()` - Decision engine for GPU allocation
  - GPU pricing lookup for T4, L4, A100, H100
  - Auto-approval and expiration processing
  - Background worker for approval lifecycle

- **Scheduler** (`/src/services/scheduler.ts`)
  - Capacity matching algorithm
  - Trust tier enforcement (MPS/MIG/Dedicated)
  - Queue management for pending requests

#### Database Models

| Model | Collection | Purpose |
|-------|------------|---------|
| Tenant | `tenants` | Organizations using Xid-R |
| CapacityUnit | `capacity_units` | GPU resources (GKE, Spot, Cloud Run) |
| Lease | `leases` | Active GPU allocations |
| Checkpoint | `checkpoints` | Saved agent state |
| HarvestingRuleSet | `harvesting_rule_sets` | Approval policies |
| HarvestingApproval | `harvesting_approvals` | Pending/resolved approvals |
| OnboardingSession | `onboarding_sessions` | Setup wizard state |
| ClusterConnection | `cluster_connections` | GKE cluster metadata |
| CloudConnection | `cloud_connections` | GCP project credentials |

---

### 2. Frontend Web App (`/web/`)

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Framer Motion

#### Design System

- **Colors:** Orange/amber gradient theme (`from-orange-500 to-amber-500`)
- **Typography:** Instrument Serif (italic headings), Inter (body)
- **Effects:** Glass morphism (`bg-white/5 backdrop-blur`), gradient orbs
- **Buttons:** Gradient with glow (`shadow-[0_0_20px_rgba(249,115,22,0.4)]`)

#### Pages

| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` | Marketing homepage |
| Onboarding | `/onboarding` | 12-step setup wizard |
| Dashboard | `/dashboard` | Main control panel |

#### Onboarding Steps (12 total)

1. **Welcome** - Introduction and feature overview
2. **Organization Details** - Name, domain, billing email, plan selection
3. **Deployment Model** - SaaS/Hybrid/Self-hosted
4. **Connect Cloud** - GCP project ID, service account upload
5. **Verify Permissions** - IAM role validation
6. **Discover Clusters** - Auto-discovery of GKE clusters
7. **Select Clusters** - Choose clusters with GPU node pools
8. **Install Agent** - kubectl/Helm installation commands
9. **Verify Agent** - Agent connectivity check
10. **Configure Rules** - Harvesting rule preset selection
11. **Generate API Keys** - Create tenant API credentials
12. **Complete** - Success summary and next steps

#### Key Components

```
/web/src/
├── components/
│   ├── onboarding/
│   │   ├── step-progress.tsx        # Progress indicator
│   │   └── steps/
│   │       ├── welcome-step.tsx
│   │       ├── organization-step.tsx
│   │       ├── deployment-step.tsx
│   │       ├── connect-cloud-step.tsx
│   │       ├── verify-permissions-step.tsx
│   │       ├── cluster-selection-step.tsx
│   │       ├── install-agent-step.tsx
│   │       ├── configure-rules-step.tsx
│   │       ├── api-keys-step.tsx
│   │       └── complete-step.tsx
│   └── ui/                          # Shared UI components
├── hooks/
│   └── use-onboarding.ts            # Onboarding state management
├── lib/
│   └── api.ts                       # API client
└── pages/
    ├── landing.tsx
    ├── onboarding.tsx
    └── dashboard.tsx
```

---

### 3. Kubernetes Agent (`/k8s/`, `/helm/`)

#### Raw Manifests (`/k8s/base/`)

- `namespace.yaml` - `xidr-system` namespace
- `serviceaccount.yaml` - Agent service account
- `rbac.yaml` - ClusterRole with GPU/node/pod permissions
- `configmap.yaml` - Agent configuration
- `secret.yaml` - Credentials template
- `deployment.yaml` - Agent deployment with health checks
- `service.yaml` - A2A + metrics endpoints
- `kustomization.yaml` - Kustomize overlay

#### Helm Chart (`/helm/xidr-agent/`)

```bash
# Installation
helm repo add xidr https://charts.xidr.dev
helm install xidr-agent xidr/xidr-agent \
  --namespace xidr-system \
  --create-namespace \
  --set organizationId=<org-id> \
  --set clusterId=<cluster-id> \
  --set apiEndpoint=https://api.xidr.dev \
  --set apiToken=<token>
```

#### Agent Capabilities

- GPU utilization monitoring via DCGM metrics
- Heartbeat reporting to control plane
- A2A negotiation endpoint for checkpoint requests
- Graceful shutdown with 300s termination grace period
- Prometheus metrics export on port 9090

---

### 4. Harvesting Rules Engine

#### Rule Conditions

| Condition | Example |
|-----------|---------|
| `gpuTypes` | `["nvidia-t4", "nvidia-l4"]` |
| `gpuValueMaxUsd` | `1.00` (only GPUs < $1/hr) |
| `nodePoolPatterns` | `["dev-*", "test-*"]` |
| `timeWindows` | Business hours (Mon-Fri 9-18) |
| `labelSelectors` | `{"environment": "dev"}` |
| `tenantTiers` | `["internal", "trusted"]` |
| `idleThresholdPercent` | `10` (< 10% utilization) |
| `idleDurationMinutes` | `5` (idle for 5+ min) |

#### Rule Actions

- **AUTO_APPROVE** - Immediately grant capacity
- **REQUIRE_APPROVAL** - Create approval request
- **DENY** - Reject harvesting

#### Default Rule Presets

1. **Conservative** - Manual approval for everything
2. **Balanced** (Recommended) - Auto-approve dev/test, manual for prod
3. **Aggressive** - Maximize utilization, minimal oversight

---

## File Structure

```
/Users/shalwinsanju/Documents/Projects/xid-r/
├── src/                          # Backend source
│   ├── api/
│   │   ├── server.ts             # Hono app setup
│   │   └── routes/
│   │       ├── mcp.ts            # MCP tool endpoints
│   │       ├── leases.ts
│   │       ├── capacity.ts
│   │       ├── agents.ts
│   │       ├── tenants.ts
│   │       ├── approvals.ts      # Rules & approvals
│   │       ├── onboarding.ts     # Setup wizard
│   │       ├── install.ts        # K8s manifest serving
│   │       └── system.ts
│   ├── db/                       # Firestore operations
│   │   ├── firestore.ts
│   │   ├── leases.ts
│   │   ├── capacity.ts
│   │   ├── harvesting-rules.ts
│   │   └── onboarding.ts
│   ├── models/                   # Type definitions & schemas
│   │   ├── capacity.ts
│   │   ├── lease.ts
│   │   ├── tenant.ts
│   │   ├── harvesting-rules.ts
│   │   ├── cloud-connection.ts
│   │   └── onboarding.ts
│   ├── services/
│   │   ├── scheduler.ts          # Capacity matching
│   │   └── rules-engine.ts       # Harvesting decisions
│   ├── middleware/
│   │   └── auth.ts               # API authentication
│   └── utils/
│       ├── logger.ts
│       └── ids.ts
├── web/                          # Frontend source
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── pages/
│   │   └── index.css
│   ├── package.json
│   └── vite.config.ts
├── k8s/                          # Kubernetes manifests
│   ├── base/
│   └── agent.yaml                # Consolidated manifest
├── helm/
│   └── xidr-agent/               # Helm chart
├── package.json
├── tsconfig.json
└── HANDOFF.md                    # This document
```

---

## Running the Project

### Prerequisites

- Node.js 20+
- GCP project with Firestore enabled
- (Optional) GKE cluster for agent testing

### Development

```bash
# Backend
cd /Users/shalwinsanju/Documents/Projects/xid-r
npm install
npm run dev

# Frontend (separate terminal)
cd web
npm install
npm run dev
```

### Build

```bash
# Backend
npm run build

# Frontend
cd web && npm run build
```

### Environment Variables

```bash
# Backend (.env)
GOOGLE_CLOUD_PROJECT=your-project-id
FIRESTORE_EMULATOR_HOST=localhost:8080  # For local dev
API_PORT=3001
API_HOST=0.0.0.0
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Frontend (.env)
VITE_API_URL=http://localhost:3001
```

---

## Remaining Work for Hackathon

### Critical Path (Must Have)

1. **Demo Recording** - 4-minute video showing:
   - Agent requesting GPU via MCP
   - Spot preemption triggering A2A negotiation
   - Checkpoint completion and resume
   - `xidr_explain` showing decision reasoning
   - Dashboard with cost savings

2. **Real Spot Preemption** - Test with actual GCP Spot VM termination

3. **ADK Integration** - Wire up Scheduler and Negotiator agents with Google ADK

### Nice to Have

- Scout agent for predictive pre-staging
- GKE Pod Snapshots integration
- Multi-cloud capacity fabric
- Slack notifications for approvals

---

## Demo Script (4 minutes)

```
0:00-0:25  PROBLEM
           - "5% GPU utilization" stat
           - "Agents need compute NOW"

0:25-0:50  SOLUTION
           - "Xid-R: broker for idle capacity"
           - Architecture flash

0:50-3:20  LIVE DEMO
           - Scene 1: Two agents request GPUs via MCP
           - Scene 2: Agent A backfilled onto idle node
           - Scene 3: Spot preemption notice arrives
           - Scene 4: A2A negotiation (show messages)
           - Scene 5: Checkpoint completes, resume on Cloud Run
           - Scene 6: xidr_explain answers "why?"
           - Scene 7: Dashboard shows savings

3:20-3:50  DIFFERENTIATION
           - vs machine0: we harvest idle, not rent standard
           - vs GKE native: we're the cross-tenant broker

3:50-4:00  CLOSE
           - "Every idle cycle, checkpointed"
```

---

## Prize Targets

| Prize | Amount | Fit |
|-------|--------|-----|
| Grand Prize | $50K | Strong if demo polished |
| Fortified Enterprise Fleet | $20K | Direct fit |
| Best Architectural Design | $5K | MCP/A2A split |
| Startup Excellence | $20K | Real business potential |

---

## Contacts & Resources

- **Plan Document:** `/Users/shalwinsanju/.claude/plans/effervescent-bouncing-tide.md`
- **Hackathon:** All Things Agentic (deadline Aug 31, 2026)
- **GCP Console:** https://console.cloud.google.com
- **Firestore:** Used for all state persistence

---

## Quick Commands

```bash
# Kill all servers
pkill -f "vite"; pkill -f "tsx"; pkill -f "node.*dev"

# Build everything
npm run build && cd web && npm run build

# Start dev servers
npm run dev &
cd web && npm run dev &

# Test API
curl http://localhost:3001/health
curl http://localhost:3001/api/system/status
```

---

*Generated by Claude Code on August 26, 2026*
