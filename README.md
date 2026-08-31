# Xid-R: The Agentic GPU Broker

> **"Every idle cycle, checkpointed"**

[![Demo Video](https://img.shields.io/badge/Demo%20Video-YouTube-red)](https://youtu.be/VBOFjhfKrHc)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-xid--r.vercel.app-blue)](https://xid-r.vercel.app)
[![API](https://img.shields.io/badge/API-Cloud%20Run-green)](https://xidr-api-612886611684.us-central1.run.app/health)
[![Track](https://img.shields.io/badge/Track-Fortified%20Enterprise%20Fleet-orange)](https://allthingsagentichackathon.devpost.com)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Submission for All Things Agentic Hackathon 2026**

---

## 📹 Demo Video

[![Xid-R Demo](https://img.youtube.com/vi/VBOFjhfKrHc/maxresdefault.jpg)](https://youtu.be/VBOFjhfKrHc)

**Watch the full demo:** https://youtu.be/VBOFjhfKrHc

---

## 🚀 Live Demo

| Component      | URL                                                                    |
| -------------- | ---------------------------------------------------------------------- |
| **Dashboard**  | https://xid-r.vercel.app                                               |
| **API Health** | https://xidr-api-612886611684.us-central1.run.app/health               |
| **API Docs**   | https://xidr-api-612886611684.us-central1.run.app/api/system/dashboard |

---

## 🎯 The Problem

Enterprise GPU infrastructure has a hidden crisis:

- **70% of GPU capacity sits idle** - Training jobs finish at 3 AM, but you pay until morning
- **Spot VM preemption crashes jobs** - Hours of compute lost, restart from scratch
- **No coordination between teams** - Every team provisions their own GPUs

**The cost?** Millions of dollars wasted on idle GPU capacity every year.

---

## 💡 The Solution

**Xid-R** creates a real-time infrastructure where AI agents autonomously negotiate for GPU resources using **Agent-to-Agent (A2A) protocol**.

When preemption happens, agents don't crash—they **checkpoint gracefully** and resume on new capacity.

### Key Features

| Feature                          | Description                                                    |
| -------------------------------- | -------------------------------------------------------------- |
| 🔄 **A2A Negotiation**           | Real-time agent-to-agent communication for graceful preemption |
| 💾 **Cooperative Checkpointing** | Agents save state to GCS before releasing GPU                  |
| 📊 **Real-time Dashboard**       | Live visibility into GPU utilization and cost savings          |
| 🤖 **Gemini Chatbot**            | Ask questions about your infrastructure in natural language    |
| 💰 **60% Cost Savings**          | Harvest idle capacity instead of paying on-demand prices       |

---

## 📖 Deep Dive: Understanding Xid-R

### Why We Built This

The AI revolution is creating unprecedented demand for GPU compute. But there's a paradox: while companies scramble to acquire GPUs, the ones they already have sit idle most of the time.

**The Numbers Tell the Story:**

- According to Cast AI's 2024 Kubernetes report, enterprise GPU utilization averages just **30%**
- A single NVIDIA A100 costs **$10,000-15,000** or **$3-4/hour** on cloud
- Large AI teams spend **$10M+/year** on GPU infrastructure
- Spot/preemptible VMs offer **60-90% savings** but crash jobs on preemption

**The Core Insight:** AI agents are transforming how we build software. What if these agents could negotiate for their own compute resources, just like they negotiate everything else?

### What Xid-R Does

Xid-R acts as an **intelligent broker** between three parties:

1. **GPU Owners** - Teams with idle GPU capacity they want to monetize
2. **AI Agents** - Autonomous agents that need compute on-demand
3. **Enterprises** - Organizations that want visibility and control

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  GPU Owner   │         │    Xid-R     │         │   AI Agent   │
│  (Idle GPU)  │◄───────►│   Broker     │◄───────►│  (Needs GPU) │
└──────────────┘         └──────────────┘         └──────────────┘
       │                        │                        │
       │   Register Capacity    │    Request GPU (MCP)   │
       │───────────────────────►│◄───────────────────────│
       │                        │                        │
       │                        │    Grant Lease         │
       │                        │───────────────────────►│
       │                        │                        │
       │   Preemption Notice    │                        │
       │───────────────────────►│                        │
       │                        │    A2A: Reclaim Req    │
       │                        │───────────────────────►│
       │                        │                        │
       │                        │    A2A: Checkpoint     │
       │                        │◄───────────────────────│
       │                        │                        │
       │   Capacity Released    │    Resume on New GPU   │
       │◄───────────────────────│───────────────────────►│
```

### How It Works: The Complete Flow

#### Step 1: Capacity Registration

GPU owners (GKE nodes, Spot VMs, or Cloud Run workers) run a **VM Agent** that:

- Reports available GPU capacity to the control plane
- Monitors utilization in real-time
- Detects preemption signals (Spot VM termination notices)

```python
# VM Agent registers capacity
{
    "type": "spot_vm",
    "gpu_type": "nvidia-t4",
    "gpu_count": 1,
    "status": "available"
}
```

#### Step 2: GPU Request (MCP Protocol)

AI agents request GPUs using **MCP (Model Context Protocol)** tools:

```bash
# Agent requests a GPU
POST /mcp/tools/xidr_request_gpu
{
    "gpu_type": "nvidia-t4",
    "a2a_endpoint": "http://my-agent:8091",
    "checkpointable": true
}
```

The **Scheduler** matches the request to available capacity based on:

- GPU type compatibility
- Current utilization
- Priority level
- Trust tier (isolation requirements)

#### Step 3: Lease Grant

If capacity is available, a **lease** is created:

```json
{
  "lease_id": "lease_abc123",
  "status": "granted",
  "capacity_unit_id": "unit_spot_vm_xyz",
  "preemption_warning_seconds": 120,
  "checkpoint_target_uri": "gs://xidr-checkpoints/lease_abc123/"
}
```

The agent now has exclusive access to the GPU and can run workloads.

#### Step 4: Preemption & A2A Negotiation (The Magic)

When the GPU needs to be reclaimed (e.g., Spot VM preemption), **this is where Xid-R shines**:

**Traditional approach:** Job crashes. Progress lost. Start over.

**Xid-R approach:** Agent-to-Agent negotiation for graceful handoff.

```
[Control Plane]                              [Tenant Agent]
      │                                            │
      │  ──── A2A: reclaim_request ────────────►  │
      │       {                                    │
      │         "lease_id": "abc123",              │
      │         "reason": "spot_preemption",       │
      │         "grace_period_seconds": 120,       │
      │         "options": [                       │
      │           {"action": "checkpoint"},        │
      │           {"action": "migrate"},           │
      │           {"action": "accept_loss"}        │
      │         ]                                  │
      │       }                                    │
      │                                            │
      │  ◄─── A2A: reclaim_response ───────────   │
      │       {                                    │
      │         "chosen_action": "checkpoint",     │
      │         "estimated_duration": 45           │
      │       }                                    │
      │                                            │
      │       [Agent saves state to GCS]           │
      │                                            │
      │  ◄─── checkpoint_ack ──────────────────   │
      │       {                                    │
      │         "checkpoint_uri": "gs://...",      │
      │         "size_bytes": 2048                 │
      │       }                                    │
      │                                            │
      │       [Capacity released]                  │
      │       [Resume queued for new GPU]          │
```

**The key innovation:** The agent makes the decision about how to handle preemption. It can:

- **Checkpoint** - Save state and resume later (default)
- **Migrate** - Move to different capacity (e.g., Cloud Run)
- **Accept Loss** - Release immediately without saving

#### Step 5: Resume on New Capacity

When new capacity becomes available, Xid-R:

1. Sends a `resume_notification` to the agent
2. Agent downloads checkpoint from GCS
3. Agent restores state and continues from where it left off

**Result:** Zero crashed jobs. Zero lost progress. Seamless execution across preemption events.

### Why A2A Protocol (Not Just REST)?

We use **A2A (Agent-to-Agent) protocol** for negotiation because:

| Aspect          | REST API                  | A2A Protocol                 |
| --------------- | ------------------------- | ---------------------------- |
| Direction       | One-way (client → server) | Bidirectional (peer-to-peer) |
| Decision Making | Server decides            | Agent decides                |
| Autonomy        | Low                       | High                         |
| Negotiation     | Not possible              | Native support               |

With A2A, the tenant agent is treated as a **peer**, not just a client. It can:

- Negotiate grace periods
- Counter-propose alternatives
- Make autonomous decisions

This is the **autonomy proof** for agentic infrastructure.

### Why MCP Protocol for Tools?

We use **MCP (Model Context Protocol)** for GPU requests because:

- **LLM-native**: Designed for AI agents to use tools
- **Structured**: Clear input/output schemas
- **Discoverable**: Agents can introspect available tools
- **Composable**: Works with any MCP-compatible agent framework

```typescript
// MCP Tool Definition
{
    name: "xidr_request_gpu",
    description: "Request GPU capacity from Xid-R broker",
    inputSchema: {
        gpu_type: "nvidia-t4",
        a2a_endpoint: "http://...",
        checkpointable: true
    }
}
```

### The Cooperative Checkpointing Model

Unlike kernel-level checkpointing (CRIU, cuda-checkpoint), Xid-R uses **cooperative checkpointing**:

| Approach       | Kernel-Level            | Cooperative (Xid-R)       |
| -------------- | ----------------------- | ------------------------- |
| Implementation | OS/kernel modifications | Application-level SDK     |
| State Captured | Full process memory     | Application-defined state |
| GPU Memory     | Requires CUDA support   | Not needed                |
| Complexity     | High                    | Low                       |
| Portability    | OS-specific             | Portable                  |

**What gets checkpointed:**

- Task queue (pending work)
- Scratchpad (intermediate results)
- Conversation history (for chat agents)
- Model weights (if applicable)
- Progress indicators

**What doesn't get checkpointed:**

- GPU VRAM contents (agent reloads on resume)
- Network connections (re-established)
- File handles (reopened)

This is simpler, more reliable, and works across all agent frameworks.

### Cost Savings Model

Xid-R saves money through two mechanisms:

**1. Harvesting Idle Capacity**

```
Traditional: Pay for 24 hours, use 8 hours (30% utilization)
Xid-R: Pay only for actual usage via harvested capacity
Savings: Up to 70%
```

**2. Using Spot/Preemptible VMs Safely**

```
On-demand A100: $3.00/hour
Spot A100: $0.90/hour (70% cheaper)
Traditional risk: Jobs crash on preemption
Xid-R: Graceful checkpoint, no lost work
```

**Pricing Model (Planned):**

- 15% gain-share on recovered compute value
- Example: Agent saves $1000/mo → Xid-R bills $150

### Security & Isolation

Xid-R supports multiple **trust tiers**:

| Tier          | Isolation                             | Use Case                  |
| ------------- | ------------------------------------- | ------------------------- |
| **MPS**       | GPU sharing (CUDA MPS)                | Trusted internal agents   |
| **MIG**       | GPU partitioning (Multi-Instance GPU) | Semi-trusted workloads    |
| **Dedicated** | Exclusive GPU access                  | External/untrusted agents |

Each tenant's checkpoint data is stored in isolated GCS paths with per-lease credentials.

### What Makes Xid-R Different

| vs.              | Xid-R Advantage                                        |
| ---------------- | ------------------------------------------------------ |
| **Raw Spot VMs** | Orchestrated checkpoint/resume, not DIY crash handling |
| **GKE Native**   | Cross-cluster/cross-tenant broker layer                |
| **machine0**     | Harvests idle capacity, not just standard VM pricing   |
| **Chamber**      | Agent-native MCP/A2A, not ops Slack bot                |

**The key differentiator:** Nobody else has built the **broker layer** that matches idle GPU capacity to agent demand with **A2A negotiation** for graceful preemption.

### Real-World Impact

In our demo environment:

| Metric                    | Value      |
| ------------------------- | ---------- |
| Capacity Units Registered | 13         |
| Checkpoints Completed     | 7+         |
| Total Savings             | $14.83     |
| Crashed Jobs              | 0          |
| Grant Latency             | < 1 second |

At enterprise scale (1000 GPUs):

- **Estimated savings:** $500K - $2M/year
- **Recovered utilization:** 30% → 85%
- **Developer productivity:** No more lost work from crashes

---

## 🧪 Testing Instructions (For Judges)

### Quick Health Check

```bash
# Check API is running
curl -s https://xidr-api-612886611684.us-central1.run.app/health | jq
# Expected: {"status":"ok","version":"0.1.0",...}

# Check registered capacity
curl -s https://xidr-api-612886611684.us-central1.run.app/api/capacity | jq '.capacity_units | length'
# Expected: 13 (capacity units)

# Check dashboard stats
curl -s https://xidr-api-612886611684.us-central1.run.app/api/system/dashboard | jq '.stats'
```

### Full E2E Test (GPU Request → Preemption → Checkpoint)

```bash
# Step 1: Request a GPU
RESPONSE=$(curl -s -X POST "https://xidr-api-612886611684.us-central1.run.app/mcp/tools/xidr_request_gpu" \
  -H "Content-Type: application/json" \
  -d '{
    "gpu_type": "nvidia-t4",
    "a2a_endpoint": "http://35.254.122.41:8091",
    "agent_id": "test-agent",
    "agent_name": "Test Agent",
    "checkpointable": true
  }')

echo "$RESPONSE" | jq

# Extract IDs
LEASE_ID=$(echo "$RESPONSE" | jq -r '.lease_id')
CAPACITY_UNIT=$(echo "$RESPONSE" | jq -r '.capacity_unit_id')

echo "Lease ID: $LEASE_ID"
echo "Capacity Unit: $CAPACITY_UNIT"

# Step 2: Trigger Preemption
curl -s -X POST "https://xidr-api-612886611684.us-central1.run.app/api/system/preemption/trigger" \
  -H "Content-Type: application/json" \
  -d "{\"capacity_unit_id\":\"$CAPACITY_UNIT\",\"reason\":\"spot_preemption\"}" | jq

# Step 3: Wait for A2A negotiation (5 seconds)
sleep 5

# Step 4: Check final lease status
curl -s "https://xidr-api-612886611684.us-central1.run.app/api/leases/$LEASE_ID" | jq '{
  status: .lease.status,
  checkpointUri: .lease.checkpointUri
}'
# Expected: status = "checkpointed", checkpointUri = "gs://..."
```

### Test via Dashboard

1. Open https://xid-r.vercel.app
2. View **Overview** - See active leases and cost savings
3. View **Capacity** - See registered GPU units
4. Use **Chatbot** - Ask "How many GPUs are available?"

---

## 🏗️ Architecture

![architecture](https://i.imgur.com/YSJyD68.png)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI AGENTS (Tenants)                         │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│   │ Research     │  │ Training     │  │ Inference    │             │
│   │ Agent        │  │ Agent        │  │ Agent        │             │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│          │ MCP Tools       │ MCP Tools       │ MCP Tools           │
│          └─────────────────┼─────────────────┘                      │
│                            ▼                                        │
├─────────────────────────────────────────────────────────────────────┤
│                    XID-R CONTROL PLANE (Cloud Run)                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  MCP Tools: xidr_request_gpu | xidr_checkpoint_ack | xidr_release │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                    │                    │                 │
│         ▼                    ▼                    ▼                 │
│  ┌────────────┐       ┌────────────┐       ┌────────────┐          │
│  │ Scheduler  │◄─────►│ Negotiator │◄─────►│  Gemini    │          │
│  │  Agent     │       │   (A2A)    │       │  Chatbot   │          │
│  └─────┬──────┘       └─────┬──────┘       └────────────┘          │
│        │                    │                                       │
│        └──────────┬─────────┘                                       │
│                   ▼                                                 │
│           ┌────────────────┐        ┌────────────────┐             │
│           │   Firestore    │        │  Cloud Storage │             │
│           │    (State)     │        │  (Checkpoints) │             │
│           └────────────────┘        └────────────────┘             │
├─────────────────────────────────────────────────────────────────────┤
│                       CAPACITY FABRIC                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   GKE GPU    │  │   Spot VMs   │  │  Cloud Run   │              │
│  │  Node Pool   │  │  (T4, L4)    │  │   Workers    │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│         │                 │                  │                      │
│         └─────────────────┼──────────────────┘                      │
│                           ▼                                         │
│                    ┌────────────┐                                   │
│                    │  VM Agent  │ (Python - reports capacity)       │
│                    └────────────┘                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### A2A Negotiation Flow

![a2a-flow](https://i.imgur.com/Ji6Z1RP.png)

```
[GPU Owner]          [Xid-R Control Plane]          [AI Agent]
     │                        │                          │
     │ Preemption Notice ---> │                          │
     │                        │ --- A2A: reclaim_request --> │
     │                        │                          │
     │                        │ <-- A2A: checkpoint ---- │
     │                        │                          │
     │                        │ <-- checkpoint_ack ----- │
     │                        │                          │
     │ <-- Capacity Released  │    [Lease: checkpointed] │
```

---

## 🛠️ Tech Stack

| Layer                  | Technology                   |
| ---------------------- | ---------------------------- |
| **Frontend**           | React + Vite + TailwindCSS   |
| **Backend**            | Node.js + Hono (Cloud Run)   |
| **Database**           | Firestore                    |
| **Checkpoint Storage** | Google Cloud Storage         |
| **AI Model**           | Gemini 2.0 Flash             |
| **Agent Protocol**     | A2A (Agent-to-Agent)         |
| **Tool Protocol**      | MCP (Model Context Protocol) |
| **GPU Infrastructure** | GKE + Spot VMs               |
| **Deployment**         | Cloud Run + Vercel           |

---

## 📦 Local Development Setup

### Prerequisites

- Node.js 22+
- npm or pnpm
- GCP Project with Firestore enabled
- Gemini API key

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/xid-r.git
cd xid-r

# Install dependencies
npm install

# Install web dependencies
cd web && npm install && cd ..
```

### Environment Setup

Create a `.env` file in the root directory:

```env
# GCP Configuration
GCP_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json

# Gemini API
GEMINI_API_KEY=your-gemini-api-key

# Server Configuration
PORT=8080
NODE_ENV=development

# CORS (for local development)
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Running Locally

```bash
# Terminal 1: Start the backend API
npm run dev

# Terminal 2: Start the frontend
cd web && npm run dev
```

- Backend: http://localhost:8080
- Frontend: http://localhost:5173

### Running the Demo Agent

```bash
# Run the visual demo agent with A2A negotiation
XIDR_API_ENDPOINT=http://localhost:8080 npx tsx scripts/demo/demo-agent.ts

# Press 'p' during training to trigger preemption and see A2A negotiation
```

---

## 📡 API Reference

### MCP Tools

#### `POST /mcp/tools/xidr_request_gpu`

Request GPU capacity for an agent.

```json
{
  "gpu_type": "nvidia-t4",
  "a2a_endpoint": "http://your-agent:8091",
  "agent_id": "my-agent",
  "agent_name": "My Research Agent",
  "checkpointable": true,
  "priority": "normal"
}
```

**Response:**

```json
{
  "lease_id": "lease_abc123",
  "status": "granted",
  "capacity_unit_id": "unit_spot_vm_xyz",
  "connection_info": {
    "host": "gpu-node-1",
    "port": 8080,
    "gpu_device": "/dev/nvidia0"
  },
  "preemption_warning_seconds": 120,
  "checkpoint_target_uri": "gs://xidr-demo-checkpoints/lease_abc123/"
}
```

#### `POST /mcp/tools/xidr_checkpoint_ack`

Acknowledge checkpoint completion.

```json
{
  "lease_id": "lease_abc123",
  "checkpoint_uri": "gs://xidr-demo-checkpoints/lease_abc123/checkpoint.json",
  "size_bytes": 2048,
  "duration_ms": 2000
}
```

#### `POST /mcp/tools/xidr_release`

Release GPU capacity.

```json
{
  "lease_id": "lease_abc123"
}
```

### REST Endpoints

| Method | Endpoint                         | Description               |
| ------ | -------------------------------- | ------------------------- |
| GET    | `/health`                        | Health check              |
| GET    | `/api/leases`                    | List all leases           |
| GET    | `/api/leases/:id`                | Get lease details         |
| GET    | `/api/capacity`                  | List capacity units       |
| GET    | `/api/capacity/summary`          | Capacity summary          |
| GET    | `/api/events`                    | Recent events             |
| GET    | `/api/system/dashboard`          | Dashboard stats           |
| POST   | `/api/system/preemption/trigger` | Trigger preemption (demo) |
| POST   | `/api/chat`                      | Gemini chatbot            |

---

## 🎬 Demo Video Timestamps

| Time | Section                        |
| ---- | ------------------------------ |
| 0:00 | The Problem: GPU Cost Crisis   |
| 0:30 | Solution: Xid-R Agentic Broker |
| 1:00 | Live Demo: Dashboard Overview  |
| 1:30 | GPU Request Flow               |
| 2:15 | Preemption & A2A Negotiation   |
| 3:15 | Architecture & Tech Stack      |
| 3:45 | Impact & Results               |

---

## 📊 Results

| Metric                        | Value         |
| ----------------------------- | ------------- |
| **Capacity Units Registered** | 13            |
| **Checkpoints Completed**     | 7+            |
| **Total Savings**             | $14.83 (demo) |
| **Crashed Jobs**              | 0             |
| **Grant Latency**             | < 1 second    |

---

## 🏆 Hackathon Track

**Fortified Enterprise Fleet**

> Build agentic systems that optimize, secure, or automate complex enterprise operations.

### Google Requirements Met

- ✅ **Gemini 2.0 Flash** - Chatbot assistant
- ✅ **Google Cloud Run** - Control plane API
- ✅ **Firestore** - Real-time state management
- ✅ **Google Cloud Storage** - Checkpoint persistence
- ✅ **GKE** - GPU node capacity

---

## 📁 Project Structure

```
xid-r/
├── src/
│   ├── index.ts              # Main entry point
│   ├── config.ts             # Configuration
│   ├── api/                  # HTTP API routes
│   │   ├── routes/
│   │   │   ├── mcp-tools.ts  # MCP tool endpoints
│   │   │   ├── leases.ts     # Lease management
│   │   │   ├── capacity.ts   # Capacity management
│   │   │   └── system.ts     # System endpoints
│   │   └── middleware/
│   ├── services/
│   │   ├── scheduler.ts      # GPU matching logic
│   │   ├── negotiator.ts     # A2A negotiation
│   │   ├── gemini-client.ts  # Gemini integration
│   │   └── firestore.ts      # Database operations
│   └── models/               # TypeScript types
├── web/                      # React frontend
│   ├── src/
│   │   ├── components/       # UI components
│   │   ├── hooks/            # React hooks
│   │   └── pages/            # Page components
│   └── vite.config.js
├── scripts/
│   └── demo/
│       ├── demo-agent.ts     # Visual demo agent
│       └── a2a-responder.py  # Cloud A2A responder
├── infra/
│   ├── vm-agent/             # GCP VM agent
│   └── gcp-setup.sh          # Infrastructure setup
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEMO_SCRIPT.md
│   ├── DEMO_INSTRUCTIONS.md
│   └── DEVPOST_SUBMISSION.md
├── Dockerfile                # Cloud Run container
└── package.json
```

---

## 🔮 Future Roadmap

| Phase  | Features                                  |
| ------ | ----------------------------------------- |
| **Q1** | Multi-cloud support (AWS, Azure)          |
| **Q2** | Predictive preemption, SLA guarantees     |
| **Q3** | Public GPU marketplace, reputation system |

---

## 📄 License

MIT

---

## 🙏 Acknowledgments

Built for the [All Things Agentic Hackathon](https://allthingsagentichackathon.devpost.com)

**Tech Partners:** Google Cloud, Gemini

---

<p align="center">
  <b>Xid-R - Making AI infrastructure as intelligent as the agents it powers.</b>
  <br><br>
  <i>Every idle cycle, checkpointed.</i>
</p>
