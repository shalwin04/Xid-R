# Xid-R: Agentic GPU Compute Broker

> "Every idle cycle, checkpointed"

Xid-R is an autonomous GPU compute broker that harvests idle GPU capacity and allocates it to AI agents. It uses MCP (Model Context Protocol) for tool integration and A2A (Agent-to-Agent) protocol for checkpoint/resume negotiation.

## Key Features

- **Capacity Discovery**: Automatically discovers and tracks GPU resources from GKE, Spot VMs, and Cloud Run
- **Intelligent Scheduling**: Matches agent requests to available capacity based on GPU type, utilization, and priority
- **A2A Negotiation**: Enables graceful preemption through agent-to-agent communication
- **Cooperative Checkpointing**: SDK for agents to save/restore state during preemption
- **Full Explainability**: `xidr_explain` provides detailed reasoning for all scheduling decisions
- **Real-time Dashboard**: Live view of capacity, leases, and system events

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TENANT AGENTS                               │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│   │ Research     │  │ Compute      │  │ Training     │  ...        │
│   │ Agent        │  │ Agent        │  │ Agent        │             │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│          │ MCP             │ MCP             │ MCP                  │
└──────────┼─────────────────┼─────────────────┼──────────────────────┘
           │                 │                 │
           ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SELF-SERVICE SURFACE                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  MCP Tools: request_gpu | checkpoint_ack | release | status │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      POLICY ENGINE                                  │
│  ┌────────────────┐           ┌────────────────┐                   │
│  │   SCHEDULER    │◄─────────►│   NEGOTIATOR   │                   │
│  │  (Rule-based)  │           │     (A2A)      │                   │
│  └───────┬────────┘           └───────┬────────┘                   │
│          │                            │                             │
│          └──────────┬─────────────────┘                            │
│                     ▼                                               │
│            ┌────────────────┐                                       │
│            │ AUDIT LEDGER   │ ◄── xidr_explain                     │
│            │  (Firestore)   │                                       │
│            └────────────────┘                                       │
└─────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     CAPACITY FABRIC                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   GKE GPU    │  │   Spot VM    │  │  Cloud Run   │              │
│  │  Node Pool   │  │    Fleet     │  │   Workers    │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- GCP project with Firestore enabled
- (Optional) GPU resources for full demo

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/xid-r.git
cd xid-r

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
# Edit .env with your GCP project settings

# Set up GCP infrastructure (optional)
chmod +x infrastructure/setup.sh
./infrastructure/setup.sh
```

### Running Locally

```bash
# Start all services
npm run start:all

# Or start individually:
npm run start:api          # API server (port 8080)
npm run start:scheduler    # Scheduler agent
npm run start:negotiator   # Negotiator agent
npm run start:capacity     # Capacity fabric
npm run start:dashboard    # Dashboard (port 8081)
```

### Running the Demo

```bash
npm run demo
```

This will:
1. Start all services
2. Seed demo capacity units
3. Simulate agent GPU requests
4. Demonstrate preemption handling
5. Show `xidr_explain` output

## MCP Tools

### xidr_request_gpu

Request GPU capacity for an agent.

```json
{
  "gpu_type": "nvidia-t4",
  "duration_hint_seconds": 3600,
  "priority": "normal",
  "a2a_endpoint": "https://my-agent.run.app",
  "checkpointable": true
}
```

### xidr_checkpoint_ack

Acknowledge checkpoint completion after preemption.

```json
{
  "lease_id": "lease_abc123",
  "checkpoint_uri": "gs://xidr-checkpoints/lease_abc123/checkpoint.json",
  "size_bytes": 1048576,
  "duration_ms": 2500
}
```

### xidr_release

Voluntarily release GPU capacity.

```json
{
  "lease_id": "lease_abc123"
}
```

### xidr_status

Check lease or system status.

```json
{
  "lease_id": "lease_abc123"  // Optional
}
```

### xidr_explain

Get explanation for scheduling decisions.

```json
{
  "lease_id": "lease_abc123",
  "event_type": "evict"  // Optional: grant, deny, evict, resume
}
```

## Checkpoint SDK

Implement `XidrCheckpointable` interface to enable cooperative checkpointing:

```typescript
import { CheckpointableAgent, CheckpointState } from 'xid-r';

class MyAgent extends CheckpointableAgent {
  constructor() {
    super('my_agent');
  }

  protected async prepareCheckpoint(): Promise<void> {
    // Prepare state for checkpoint
  }

  protected async onCheckpointComplete(uri: string): Promise<void> {
    // Handle post-checkpoint actions
  }

  protected async onRestoreComplete(state: CheckpointState): Promise<void> {
    // Resume from restored state
  }
}
```

## CLI

```bash
# Show system status
npm run cli status

# List active leases
npm run cli leases

# List capacity units
npm run cli capacity

# Explain a lease
npm run cli explain lease_abc123

# Show recent events
npm run cli events
```

## Project Structure

```
xid-r/
├── src/
│   ├── api/              # HTTP API (Hono)
│   │   ├── routes/       # MCP tools & REST endpoints
│   │   └── server.ts
│   ├── agents/           # Policy engine agents
│   │   ├── scheduler.ts  # Capacity matching
│   │   └── negotiator.ts # A2A reclaim flow
│   ├── capacity/         # Capacity fabric
│   │   ├── fabric.ts     # Discovery & tracking
│   │   └── preemption.ts # Spot VM handler
│   ├── checkpoint/       # Checkpoint SDK
│   │   └── sdk.ts
│   ├── dashboard/        # Real-time dashboard
│   │   └── server.ts
│   ├── db/               # Firestore operations
│   ├── models/           # Data models
│   ├── tenant-agents/    # Demo tenant agents
│   └── utils/
├── infrastructure/       # GCP setup scripts
├── scripts/              # Demo & utilities
└── tests/
```

## Differentiation

| vs. | Xid-R Advantage |
|-----|-----------------|
| **Raw Spot VMs** | Orchestrated checkpoint/resume, not DIY |
| **GKE Native** | Cross-cluster broker layer, not single-cluster |
| **machine0** | Harvests idle, not standard pricing |
| **Chamber** | Agent-native MCP, not ops Slack bot |

## Pricing Model

- **Gain-share**: 15% of recovered compute value
- **Example**: Agent saves $1000/mo on-demand → Xid-R bills $150

## License

MIT

---

Built for the [All Things Agentic Hackathon](https://allthingsagentic.xyz)

*Every idle cycle, checkpointed.*
