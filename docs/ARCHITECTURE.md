# Xid-R Architecture

> **Agentic GPU Compute Broker** - Let AI agents negotiate for GPU resources

## Overview

Xid-R is a GPU compute broker that enables AI agents to dynamically request, use, and gracefully release GPU capacity. It uses LLM-powered agents for intelligent scheduling and cooperative preemption handling.

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              XID-R ARCHITECTURE                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────────────┐    ┌─────────────────────────────────────┐ │
│  │      XID-R CONTROL PLANE            │    │      CUSTOMER INFRASTRUCTURE        │ │
│  │      (Our Cloud Run)                │    │      (Their GKE / GCP)              │ │
│  │                                     │    │                                      │ │
│  │  ┌─────────────────────────────┐   │    │  ┌────────────────────────────────┐ │ │
│  │  │   API Server (Hono.js)      │   │    │  │   Customer's GKE Cluster       │ │ │
│  │  │                             │   │    │  │                                │ │ │
│  │  │  ┌─────────┐ ┌───────────┐ │   │    │  │  ┌──────────────────────────┐ │ │ │
│  │  │  │Scheduler│ │Negotiator │ │   │    │  │  │  Xid-R Agent (DaemonSet) │ │ │ │
│  │  │  │  Agent  │ │   Agent   │ │   │    │  │  │  - GPU node monitoring   │ │ │ │
│  │  │  │  (LLM)  │ │   (LLM)   │ │   │    │  │  │  - Utilization reporting │ │ │ │
│  │  │  └────┬────┘ └─────┬─────┘ │   │    │  │  │  - Preemption detection  │ │ │ │
│  │  │       │            │       │   │    │  │  └───────────┬──────────────┘ │ │ │
│  │  │  ┌────┴────────────┴────┐  │   │    │  │              │                │ │ │
│  │  │  │  REST API + MCP      │◄─┼────┼────┼──┼──────────────┘                │ │ │
│  │  │  │  WebSocket           │  │    │   │  │                                │ │ │
│  │  │  └──────────┬───────────┘  │   │    │  │  ┌──────────────────────────┐ │ │ │
│  │  │             │              │   │    │  │  │   GPU Node Pool          │ │ │ │
│  │  │  ┌──────────┴───────────┐  │   │    │  │  │   (Spot/Preemptible)     │ │ │ │
│  │  │  │     Firestore        │  │   │    │  │  │                          │ │ │ │
│  │  │  │  - Leases            │  │   │    │  │  │  ┌────┐ ┌────┐ ┌────┐  │ │ │ │
│  │  │  │  - Capacity          │  │   │    │  │  │  │GPU0│ │GPU1│ │GPU2│  │ │ │ │
│  │  │  │  - Checkpoints       │  │   │    │  │  │  └────┘ └────┘ └────┘  │ │ │ │
│  │  │  │  - Audit Events      │  │   │    │  │  └──────────────────────────┘ │ │ │
│  │  │  └──────────────────────┘  │   │    │  └────────────────────────────────┘ │ │
│  │  └─────────────────────────────┘   │    │                                      │ │
│  │                                     │    │  ┌────────────────────────────────┐ │ │
│  │  ┌─────────────────────────────┐   │    │  │   Customer's AI Agents         │ │ │
│  │  │   Dashboard (React)         │   │    │  │                                │ │ │
│  │  │   - Real-time monitoring    │   │    │  │  ┌─────────┐  ┌─────────┐     │ │ │
│  │  │   - LLM explanations        │   │    │  │  │Research │  │Training │     │ │ │
│  │  │   - Cost analytics          │   │    │  │  │ Agent   │  │ Agent   │     │ │ │
│  │  └─────────────────────────────┘   │    │  │  └────┬────┘  └────┬────┘     │ │ │
│  │                                     │    │  │       │            │          │ │ │
│  └─────────────────────────────────────┘    │  │       └─────┬──────┘          │ │ │
│                                              │  │             │ MCP + A2A       │ │ │
│                                              │  └─────────────┼─────────────────┘ │ │
│                                              │                │                    │ │
│  ◄────────────────────────────────────────────────────────────┘                    │ │
│                           HTTPS / WebSocket                                        │ │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Control Plane (Our Infrastructure)

The control plane runs on Cloud Run and manages all GPU brokering operations.

#### API Server (`src/index.ts`)
- **Framework:** Hono.js (lightweight, fast)
- **Endpoints:**
  - `/api/*` - REST API for leases, capacity, agents
  - `/mcp/*` - Model Context Protocol tools
  - `/health` - Health checks
  - WebSocket - Real-time dashboard updates

#### LLM Agents (`src/agents/`)

| Agent | Role | Technology |
|-------|------|------------|
| **Scheduler** | Decides GPU allocation, priority, fairness | Gemini + Function Calling |
| **Negotiator** | Handles preemption negotiation via A2A | Gemini + Function Calling |
| **Chatbot** | Explains decisions, answers questions | Gemini |

#### Database (`src/db/`)
- **Firestore** (Native mode)
- Collections:
  - `leases` - GPU lease records
  - `capacity_units` - Available GPU resources
  - `checkpoints` - Checkpoint metadata
  - `audit_events` - Decision audit trail
  - `tenants` - Multi-tenant management
  - `organizations` - Customer organizations

### 2. Customer Infrastructure

#### Xid-R Agent (`k8s/agent.yaml`)
A DaemonSet deployed on customer's GPU nodes:

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: xidr-agent
  namespace: xidr-system
spec:
  selector:
    matchLabels:
      app: xidr-agent
  template:
    spec:
      nodeSelector:
        cloud.google.com/gke-accelerator: "nvidia-tesla-t4"
      containers:
      - name: agent
        image: xidr/agent:latest
        env:
        - name: XIDR_API_ENDPOINT
          value: "https://api.xidr.io"
        - name: XIDR_ORG_ID
          valueFrom:
            secretKeyRef:
              name: xidr-credentials
              key: org-id
```

**Responsibilities:**
- Monitor GPU utilization on nodes
- Report capacity to control plane
- Detect preemption events
- Handle checkpoint storage

#### Customer's AI Agents
AI agents that use Xid-R for GPU access via MCP tools:

```python
from xidr import XidrClient

xidr = XidrClient(api_key="sk-...")

# Request GPU
lease = xidr.request_gpu(
    gpu_type="nvidia-t4",
    a2a_endpoint="http://my-agent:8090/a2a",
    checkpointable=True
)

# Use GPU
model.train(device=lease.gpu_device)

# Release when done
xidr.release(lease.lease_id)
```

---

## Protocols

### MCP (Model Context Protocol)

Xid-R exposes GPU operations as MCP tools that AI agents can call:

| Tool | Description |
|------|-------------|
| `xidr_request_gpu` | Request GPU capacity |
| `xidr_release` | Release a lease |
| `xidr_checkpoint_ack` | Acknowledge checkpoint completion |
| `xidr_status` | Get system or lease status |
| `xidr_explain` | Get AI explanation of decisions |

### A2A (Agent-to-Agent Protocol)

Used for preemption negotiation between Xid-R and tenant agents:

```
Xid-R Negotiator                    Tenant Agent
       │                                  │
       │  POST /a2a                       │
       │  {                               │
       │    "task_type": "reclaim_request",
       │    "data": {                     │
       │      "lease_id": "...",          │
       │      "grace_period_seconds": 120,│
       │      "reason": "spot_preemption",│
       │      "options": [                │
       │        "checkpoint",             │
       │        "migrate",                │
       │        "accept_loss"             │
       │      ]                           │
       │    }                             │
       │  }                               │
       │─────────────────────────────────►│
       │                                  │
       │  Response:                       │
       │  {                               │
       │    "chosen_action": "checkpoint",│
       │    "checkpoint_uri": "gs://..."  │
       │  }                               │
       │◄─────────────────────────────────│
       │                                  │
```

---

## Data Flow

### 1. GPU Request Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  AI Agent    │     │  Xid-R API   │     │  Scheduler   │     │  Firestore   │
│              │     │              │     │    Agent     │     │              │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │                    │
       │ 1. request_gpu     │                    │                    │
       │───────────────────►│                    │                    │
       │                    │ 2. Check capacity  │                    │
       │                    │───────────────────►│                    │
       │                    │                    │ 3. Query available │
       │                    │                    │───────────────────►│
       │                    │                    │◄───────────────────│
       │                    │                    │                    │
       │                    │ 4. Decision:       │                    │
       │                    │    Grant GPU-0     │                    │
       │                    │◄───────────────────│                    │
       │                    │                    │                    │
       │                    │ 5. Create lease    │                    │
       │                    │───────────────────────────────────────►│
       │                    │                    │                    │
       │ 6. Response:       │                    │                    │
       │    lease_id,       │                    │                    │
       │    connection_info │                    │                    │
       │◄───────────────────│                    │                    │
       │                    │                    │                    │
```

### 2. Preemption Flow

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│     GCP      │  │  Xid-R Agent │  │  Control     │  │  Negotiator  │  │  AI Agent    │
│              │  │  (on node)   │  │  Plane       │  │    Agent     │  │              │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │                 │                 │
       │ 1. Spot VM      │                 │                 │                 │
       │ preemption      │                 │                 │                 │
       │ notice          │                 │                 │                 │
       │────────────────►│                 │                 │                 │
       │                 │                 │                 │                 │
       │                 │ 2. Report:      │                 │                 │
       │                 │ "GPU preempted" │                 │                 │
       │                 │────────────────►│                 │                 │
       │                 │                 │                 │                 │
       │                 │                 │ 3. Lookup lease │                 │
       │                 │                 │    Find agent   │                 │
       │                 │                 │────────────────►│                 │
       │                 │                 │                 │                 │
       │                 │                 │                 │ 4. A2A:         │
       │                 │                 │                 │ reclaim_request │
       │                 │                 │                 │────────────────►│
       │                 │                 │                 │                 │
       │                 │                 │                 │ 5. Agent saves  │
       │                 │                 │                 │    checkpoint   │
       │                 │                 │                 │                 │
       │                 │                 │                 │ 6. Response:    │
       │                 │                 │                 │ checkpoint done │
       │                 │                 │                 │◄────────────────│
       │                 │                 │                 │                 │
       │                 │                 │ 7. Queue resume │                 │
       │                 │                 │◄────────────────│                 │
       │                 │                 │                 │                 │
       │                 │                 │ 8. Find new GPU │                 │
       │                 │                 │    Grant lease  │                 │
       │                 │                 │────────────────────────────────────►
       │                 │                 │                 │                 │
       │                 │                 │                 │ 9. Agent resumes│
       │                 │                 │                 │    from ckpt    │
       │                 │                 │                 │                 │
```

---

## Deployment Architecture

### Production Deployment

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLOUD RUN                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  xidr-server                                                 ││
│  │  - Auto-scales 0 → N                                         ││
│  │  - 2 vCPU, 2GB RAM per instance                              ││
│  │  - Custom domain: api.xidr.io                                ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        FIRESTORE                                 │
│  - Native mode                                                   │
│  - us-central1                                                   │
│  - Auto-scaling                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUD STORAGE                                │
│  - Checkpoint bucket: gs://xidr-checkpoints                      │
│  - Multi-region (US)                                             │
└─────────────────────────────────────────────────────────────────┘
```

### Customer Deployment

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER'S GKE CLUSTER                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  xidr-system namespace                                       ││
│  │  ┌─────────────────────────────────────────────────────────┐││
│  │  │  xidr-agent (DaemonSet)                                  │││
│  │  │  - Runs on every GPU node                                │││
│  │  │  - Reports to control plane                              │││
│  │  └─────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  gpu-pool (Node Pool - Spot)                                 ││
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                      ││
│  │  │ Node 1  │  │ Node 2  │  │ Node 3  │                      ││
│  │  │ T4 GPU  │  │ T4 GPU  │  │ T4 GPU  │                      ││
│  │  └─────────┘  └─────────┘  └─────────┘                      ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Configuration

### Environment Variables

```bash
# GCP
GCP_PROJECT_ID=xid-r-development
GCP_REGION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./xidr-sa-key.json

# API Server
API_HOST=0.0.0.0
API_PORT=8080

# LLM
GOOGLE_API_KEY=<gemini-api-key>
GEMINI_MODEL=gemini-3.6-flash

# Firestore
FIRESTORE_DATABASE=(default)

# Capacity
USE_REAL_GKE=false  # Set to true for production
UTILIZATION_POLL_INTERVAL_MS=30000
IDLE_THRESHOLD_PERCENT=15

# Checkpoints
CHECKPOINT_BUCKET=xidr-checkpoints
```

---

## Security

### Authentication

1. **API Keys** - Tenant-scoped keys with rate limiting
2. **Service Accounts** - GCP service account for infrastructure access
3. **A2A Bearer Tokens** - Secure agent-to-agent communication

### Data Protection

1. **Firestore** - IAM-controlled access
2. **Cloud Storage** - Bucket-level permissions
3. **Secrets** - Kubernetes secrets for agent credentials

---

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Control Plane API | ✅ Complete | All routes implemented |
| MCP Tools | ✅ Complete | 5 tools available |
| Firestore Integration | ✅ Complete | 12 collections |
| WebSocket Updates | ✅ Complete | Real-time dashboard |
| Authentication | ✅ Complete | API keys + multi-tenancy |
| Checkpoint SDK | ✅ Complete | GCS integration |
| Rule-based Scheduler | ✅ Complete | FIFO + priority |
| Rule-based Negotiator | ✅ Complete | A2A negotiation |
| LLM Scheduler | ⚠️ Framework | Needs verification |
| LLM Negotiator | ⚠️ Framework | Needs verification |
| GKE Discovery | ⚠️ Gated | Set USE_REAL_GKE=true |
| GPU Monitoring | ❌ Missing | Needs implementation |
| Preemption Webhooks | ❌ Missing | Only metadata server |

---

## Quick Start

### 1. Deploy Control Plane

```bash
# Build and deploy to Cloud Run
gcloud run deploy xidr-server \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

### 2. Install Agent in Customer Cluster

```bash
# Create namespace and secrets
kubectl create namespace xidr-system
kubectl create secret generic xidr-credentials \
  --from-literal=org-id=<ORG_ID> \
  --from-literal=api-key=<API_KEY> \
  -n xidr-system

# Deploy agent
kubectl apply -f k8s/agent.yaml
```

### 3. Integrate AI Agent

```python
# Install SDK
pip install xidr-sdk

# Use in agent
from xidr import XidrClient

xidr = XidrClient(api_key="sk-...")
lease = xidr.request_gpu(gpu_type="nvidia-t4")
# ... use GPU ...
xidr.release(lease.lease_id)
```

---

## Demo Mode: Compute Engine

For demos and testing, Xid-R supports a Compute Engine-based deployment that simulates GPU infrastructure using Spot VMs.

### Demo Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPUTE ENGINE DEMO ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────┐     ┌─────────────────────────────┐        │
│  │   Control Plane (Local)     │     │   Spot VMs ("GPU Nodes")    │        │
│  │   http://localhost:8080     │     │                              │        │
│  │                             │     │   ┌─────────────────────┐   │        │
│  │   ┌───────────────────┐    │     │   │ xidr-gpu-1 (Spot)   │   │        │
│  │   │ API + Scheduler   │◄───┼─────┼───│ VM Agent (Python)   │   │        │
│  │   │ Negotiator        │    │     │   │ Reports: nvidia-t4  │   │        │
│  │   └───────────────────┘    │     │   └─────────────────────┘   │        │
│  │                             │     │                              │        │
│  │   ┌───────────────────┐    │     │   ┌─────────────────────┐   │        │
│  │   │ Firestore         │    │     │   │ xidr-gpu-2 (Spot)   │   │        │
│  │   │ (Real database)   │    │     │   │ VM Agent (Python)   │   │        │
│  │   └───────────────────┘    │     │   │ Reports: nvidia-l4  │   │        │
│  │                             │     │   └─────────────────────┘   │        │
│  │   ┌───────────────────┐    │     │                              │        │
│  │   │ Dashboard         │    │     └─────────────────────────────┘        │
│  │   │ http://localhost:3000  │                                            │
│  │   └───────────────────┘    │     ┌─────────────────────────────┐        │
│  │                             │     │   Demo Agent (Local)        │        │
│  └─────────────────────────────┘     │                              │        │
│                                       │   ┌─────────────────────┐   │        │
│                                       │   │ demo-agent.ts       │   │        │
│                ◄──────────────────────│   │ - Requests GPU      │   │        │
│                  MCP + A2A            │   │ - Shows training    │   │        │
│                                       │   │ - Handles preemption│   │        │
│                                       │   └─────────────────────┘   │        │
│                                       └─────────────────────────────┘        │
│                                                                              │
│  PREEMPTION SIMULATION:                                                      │
│  $ gcloud compute instances stop xidr-gpu-1  →  Triggers preemption flow    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Demo Components

| Component | Location | Description |
|-----------|----------|-------------|
| **VM Agent** | `infra/vm-agent/agent.py` | Python agent for Compute Engine VMs |
| **Demo Agent** | `scripts/demo/demo-agent.ts` | Visual AI agent with training simulation |
| **Setup Script** | `scripts/demo/setup-demo-vms.sh` | Creates/manages Spot VMs |
| **Demo Runner** | `scripts/demo/run-demo.sh` | Runs complete demo flow |

### Running the Demo

#### Option 1: Local Demo (Simulated GPUs)

```bash
# Terminal 1: Start backend
npm run dev

# Terminal 2: Start frontend
npm run web

# Terminal 3: Run demo agent
npm run demo:agent
```

#### Option 2: GCP Demo (Real VMs)

```bash
# 1. Create Spot VMs
./scripts/demo/setup-demo-vms.sh create

# 2. Install agents on VMs
./scripts/demo/setup-demo-vms.sh install-all

# 3. Run demo agent locally
npm run demo:agent

# 4. Trigger preemption (in another terminal)
./scripts/demo/setup-demo-vms.sh preempt xidr-gpu-1

# 5. Cleanup when done
./scripts/demo/setup-demo-vms.sh cleanup
```

### Demo Flow for Video Recording

1. **Setup** (30s)
   - Show GCP Console with Spot VMs running
   - Show Xid-R dashboard with available capacity

2. **GPU Request** (30s)
   - Demo agent requests GPU
   - Dashboard shows lease granted
   - Agent starts "training"

3. **Preemption** (60s)
   - Trigger: `gcloud compute instances stop xidr-gpu-1`
   - Dashboard shows preemption alert
   - A2A negotiation in terminal
   - Checkpoint saved

4. **Resume** (30s)
   - Agent gets new GPU (xidr-gpu-2)
   - Restores from checkpoint
   - Continues training

5. **Summary** (30s)
   - Show cost savings in dashboard
   - Use "Ask AI" to explain what happened

### Cost

- Spot VMs: ~$0.006/hr each
- Total demo cost: **< $0.05** for a full recording session

---

## SDK: @xidr/agent-sdk

The SDK enables AI agents to integrate with Xid-R for GPU access.

### Installation

```bash
npm install @xidr/agent-sdk
```

### Usage

```typescript
import { Hono } from "hono";
import {
  XidrClient,
  createA2ARoutes,
  CheckpointManager,
  XidrCheckpointable,
} from "@xidr/agent-sdk";

// 1. Implement checkpointable interface
class MyAgent implements XidrCheckpointable {
  private state = { tasks: [], progress: 0 };

  async getCheckpointState() { return this.state; }
  async restoreFromCheckpoint(state) { this.state = state; }
  getStateEstimate() { return JSON.stringify(this.state).length; }
}

// 2. Set up Hono app with A2A routes
const app = new Hono();
const agent = new MyAgent();
const checkpointManager = new CheckpointManager({ agentType: "my-agent" });

app.route("/a2a", createA2ARoutes({
  agent,
  checkpointManager,
  agentType: "my-agent",
}));

// 3. Use client to interact with Xid-R
const client = new XidrClient({ baseUrl: "http://localhost:8080" });

const lease = await client.requestGpu({
  gpu_type: "nvidia-t4",
  a2a_endpoint: "http://my-agent:8080/a2a",
});

// ... do work ...

await client.release({ lease_id: lease.lease_id });
```

### SDK Components

| Export | Description |
|--------|-------------|
| `XidrClient` | API client for MCP tools |
| `createA2ARoutes` | Hono middleware for A2A protocol |
| `CheckpointManager` | Checkpoint to/from GCS |
| `XidrCheckpointable` | Interface for checkpointable agents |

---

## License

MIT License - Built for the All Things Agentic Hackathon 2026
