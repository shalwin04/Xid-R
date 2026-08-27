# Xid-R User Flow

## Overview

Xid-R is an **agentic GPU compute broker** that matches AI agents with idle GPU capacity. This document explains the complete user journey from both perspectives:

1. **Agent Developer** - Building agents that use Xid-R for GPU compute
2. **Platform Operator** - Managing GPU infrastructure with Xid-R

---

## Agent Developer Flow

### Step 1: Register Your Agent

Before requesting GPUs, register your agent with Xid-R:

```bash
curl -X POST http://localhost:8080/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-research-agent",
    "name": "Research Agent",
    "a2a_endpoint": "http://my-agent:8080/a2a/tasks",
    "checkpointable": true
  }'
```

**What this does:**
- Registers your agent's A2A endpoint for negotiation callbacks
- Declares checkpoint capability (can save/restore state)
- Creates an agent card in the system

### Step 2: Request GPU Capacity

Use the MCP tool `xidr_request_gpu`:

```bash
curl -X POST http://localhost:8080/mcp/tools/xidr_request_gpu \
  -H "Content-Type: application/json" \
  -d '{
    "gpu_type": "nvidia-t4",
    "duration_hint_seconds": 3600,
    "priority": "normal",
    "a2a_endpoint": "http://my-agent:8080/a2a/tasks",
    "checkpointable": true
  }'
```

**Response (Granted):**
```json
{
  "lease_id": "lease_abc123",
  "status": "granted",
  "capacity_unit_id": "gke-node-gpu-001",
  "connection_info": {
    "host": "10.0.1.5",
    "port": 8080,
    "gpu_device": "cuda:0"
  },
  "checkpoint_target_uri": "gs://xidr-checkpoints/lease_abc123/"
}
```

**Response (Queued):**
```json
{
  "lease_id": "lease_xyz789",
  "status": "queued",
  "queue_position": 3,
  "estimated_wait_seconds": 120
}
```

### Step 3: Implement A2A Endpoint

Your agent must handle A2A messages. Here's the minimal implementation:

```typescript
// POST /a2a/tasks
app.post('/a2a/tasks', async (c) => {
  const task = await c.req.json();

  switch (task.type) {
    case 'reclaim_request':
      // Xid-R is asking you to vacate
      // Options: checkpoint, migrate, accept_loss
      return handleReclaim(task);

    case 'resume_notification':
      // New capacity available, restore state
      return handleResume(task);

    case 'status_check':
      // Health check
      return { status: 'healthy', lease_id: currentLeaseId };
  }
});
```

### Step 4: Handle Preemption

When Xid-R needs your capacity back (Spot preemption, primary workload, etc.):

```
Xid-R Negotiator → Your Agent
{
  "type": "reclaim_request",
  "lease_id": "lease_abc123",
  "grace_period_seconds": 120,
  "reason": "spot_preemption",
  "options": [
    { "action": "checkpoint", "target": "gs://xidr-checkpoints/..." },
    { "action": "migrate", "target": "cloud_run" },
    { "action": "accept_loss" }
  ]
}
```

**Your response:**
```json
{
  "type": "reclaim_response",
  "lease_id": "lease_abc123",
  "chosen_action": "checkpoint",
  "estimated_duration_seconds": 30
}
```

### Step 5: Checkpoint State

Save your state to GCS:

```typescript
async function checkpoint(targetUri: string) {
  const state = {
    task_queue: this.tasks,
    scratchpad: this.workingMemory,
    conversation_history: this.history.slice(-100),
    progress: this.currentTaskProgress
  };

  await storage.bucket('xidr-checkpoints')
    .file('lease_abc123/state.json')
    .save(JSON.stringify(state));

  // Acknowledge to Xid-R
  await xidrClient.checkpointAck({
    lease_id: 'lease_abc123',
    checkpoint_uri: targetUri,
    size_bytes: JSON.stringify(state).length
  });
}
```

### Step 6: Resume from Checkpoint

When new capacity is found:

```
Xid-R → Your Agent
{
  "type": "resume_notification",
  "new_lease_id": "lease_def456",
  "checkpoint_uri": "gs://xidr-checkpoints/lease_abc123/state.json",
  "capacity_info": { ... }
}
```

Restore and continue:

```typescript
async function restore(checkpointUri: string) {
  const data = await storage.bucket('xidr-checkpoints')
    .file('lease_abc123/state.json')
    .download();

  const state = JSON.parse(data.toString());
  this.tasks = state.task_queue;
  this.workingMemory = state.scratchpad;
  this.history = state.conversation_history;

  // Continue processing
  this.startWork();
}
```

### Step 7: Release When Done

```bash
curl -X POST http://localhost:8080/mcp/tools/xidr_release \
  -H "Content-Type: application/json" \
  -d '{"lease_id": "lease_abc123"}'
```

**Response:**
```json
{
  "released": true,
  "billable_seconds": 3600,
  "baseline_cost_usd": 1.26,
  "actual_cost_usd": 0.38,
  "savings_usd": 0.88
}
```

---

## Platform Operator Flow

### Step 1: Onboarding

1. **Start onboarding** at `/onboarding`
2. **Connect GCP project** with service account
3. **Discover clusters** - Xid-R finds your GKE GPU node pools
4. **Select clusters** to manage
5. **Install agent** - DaemonSet for capacity discovery
6. **Configure rules** - Approval policies, trust tiers
7. **Generate API keys** for tenant agents

### Step 2: Capacity Registration

Xid-R automatically discovers GPU capacity, but you can also register manually:

```bash
# Register a Spot VM
curl -X POST http://localhost:8080/api/capacity/register \
  -H "Content-Type: application/json" \
  -d '{
    "type": "spot_vm",
    "project_id": "my-project",
    "zone": "us-central1-a",
    "gpu_type": "nvidia-t4",
    "memory_gb": 16,
    "instance_name": "spot-gpu-001",
    "on_demand_hourly_usd": 0.35
  }'
```

### Step 3: Monitor Dashboard

The dashboard shows:

- **Active Leases**: Currently running agent workloads
- **Pending Requests**: Queued GPU requests
- **Total Savings**: Money saved vs on-demand
- **GPU Utilization**: Heatmap of all GPUs
- **Recent Events**: Audit timeline

### Step 4: Explain Decisions

Use the Explain page to understand scheduling decisions:

```bash
# MCP tool
curl -X POST http://localhost:8080/mcp/tools/xidr_explain \
  -d '{"lease_id": "lease_abc123"}'

# Or ask the AI
curl -X POST http://localhost:8080/api/chat/message \
  -d '{"message": "Why was lease_abc123 evicted?"}'
```

**Response:**
```
Lease abc123 was evicted at 14:32:07 UTC because:
- Spot VM spot-gpu-001 received preemption notice (120s grace)
- Negotiator contacted agent via A2A
- Agent chose to checkpoint (completed in 47s, 1.2MB)
- New capacity found on gke-node-gpu-002
- Agent resumed successfully after 23s total downtime
```

---

## Complete Request Lifecycle

```
┌──────────────────────────────────────────────────────────────────────┐
│                         REQUEST LIFECYCLE                            │
└──────────────────────────────────────────────────────────────────────┘

  Agent                    Xid-R                      Capacity
    │                        │                           │
    │  xidr_request_gpu      │                           │
    │───────────────────────>│                           │
    │                        │                           │
    │                        │  Check available capacity │
    │                        │<─────────────────────────>│
    │                        │                           │
    │   Lease granted        │  Mark as leased          │
    │<───────────────────────│──────────────────────────>│
    │                        │                           │
    │   (Agent working...)   │  Monitor utilization     │
    │========================│<─────────────────────────>│
    │                        │                           │
    │                        │  PREEMPTION SIGNAL       │
    │                        │<──────────────────────────│
    │                        │                           │
    │  A2A: reclaim_request  │                           │
    │<───────────────────────│                           │
    │                        │                           │
    │  A2A: checkpoint       │                           │
    │───────────────────────>│                           │
    │                        │                           │
    │  Write to GCS          │                           │
    │─────────────────────────────────────────────────>  │
    │                        │                           │
    │  xidr_checkpoint_ack   │                           │
    │───────────────────────>│                           │
    │                        │                           │
    │                        │  Find new capacity       │
    │                        │<─────────────────────────>│
    │                        │                           │
    │  A2A: resume           │                           │
    │<───────────────────────│                           │
    │                        │                           │
    │  Restore from GCS      │                           │
    │<─────────────────────────────────────────────────  │
    │                        │                           │
    │   (Agent continues)    │                           │
    │========================│                           │
    │                        │                           │
    │  xidr_release          │  Mark available          │
    │───────────────────────>│──────────────────────────>│
    │                        │                           │
    │   Billing summary      │                           │
    │<───────────────────────│                           │
    │                        │                           │
```

---

## MCP Tools Summary

| Tool | Purpose | Agent Calls |
|------|---------|-------------|
| `xidr_request_gpu` | Request GPU capacity | Yes |
| `xidr_checkpoint_ack` | Acknowledge checkpoint completion | Yes |
| `xidr_release` | Voluntarily release capacity | Yes |
| `xidr_status` | Check lease or system status | Optional |
| `xidr_explain` | Get decision explanations | Optional |

---

## Quick Start

```bash
# 1. Start the API server
npm run dev

# 2. Seed demo capacity
npm run setup:local

# 3. Start a demo agent
npm run start:demo-agent

# 4. Open dashboard
npm run web
# Visit http://localhost:3000

# 5. Request GPU from demo agent
curl -X POST http://localhost:8090/start \
  -H "Content-Type: application/json" \
  -d '{"gpu_type": "nvidia-t4"}'

# 6. Check status
curl http://localhost:8090/status

# 7. Run integration tests
npm run test:integration
```

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                            Xid-R                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   MCP API    │    │   REST API   │    │  WebSocket   │          │
│  │  (Tools)     │    │  (Dashboard) │    │  (Realtime)  │          │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘          │
│         │                   │                   │                   │
│         └───────────────────┼───────────────────┘                   │
│                             │                                        │
│                     ┌───────┴───────┐                               │
│                     │  Hono Server  │                               │
│                     └───────┬───────┘                               │
│                             │                                        │
│  ┌──────────────────────────┼──────────────────────────┐           │
│  │                 Policy Engine                        │           │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │           │
│  │  │  Scheduler   │  │  Negotiator  │  │  Chatbot  │  │           │
│  │  │  (Gemini)    │  │  (Gemini)    │  │  (Gemini) │  │           │
│  │  └──────────────┘  └──────────────┘  └───────────┘  │           │
│  └──────────────────────────┬──────────────────────────┘           │
│                             │                                        │
│  ┌──────────────────────────┼──────────────────────────┐           │
│  │              Capacity Fabric                         │           │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌───────────┐  │           │
│  │  │  GKE   │  │  Spot  │  │ Cloud  │  │ On-Prem   │  │           │
│  │  │  GPUs  │  │  VMs   │  │  Run   │  │ (Future)  │  │           │
│  │  └────────┘  └────────┘  └────────┘  └───────────┘  │           │
│  └─────────────────────────────────────────────────────┘           │
│                             │                                        │
│                     ┌───────┴───────┐                               │
│                     │   Firestore   │                               │
│                     │   (State)     │                               │
│                     └───────────────┘                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ A2A Protocol
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Tenant Agents                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Research   │  │   Compute    │  │    Your      │              │
│  │    Agent     │  │    Agent     │  │    Agent     │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```
