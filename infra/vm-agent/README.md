# Xid-R VM Agent

Lightweight Python agent that runs on Compute Engine VMs to report GPU capacity to the Xid-R control plane.

## Features

- **Capacity Registration** - Reports GPU type/count to control plane
- **Heartbeat** - Periodic status updates (every 30s)
- **Preemption Detection** - Monitors GCP metadata for preemption notices
- **Health Endpoint** - HTTP health check on port 8090

## Usage

### Local Development

```bash
# Start with default settings (connects to localhost:8080)
python agent.py

# Custom endpoint
python agent.py --api-endpoint http://localhost:8080 --org-id my-org

# Simulate different GPU
GPU_TYPE=nvidia-l4 GPU_COUNT=2 python agent.py
```

### On GCP Compute Engine

```bash
# The agent auto-detects GCP metadata
python agent.py --api-endpoint https://api.xidr.io --org-id prod-org --api-key sk-xxx
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `XIDR_API_ENDPOINT` | Control plane URL | `http://localhost:8080` |
| `XIDR_ORG_ID` | Organization ID | `demo-org` |
| `XIDR_API_KEY` | API key | None |
| `GPU_TYPE` | Simulated GPU type | `nvidia-t4` |
| `GPU_COUNT` | Simulated GPU count | `1` |

## GCP Metadata

When running on GCP, the agent reads:

- `instance/name` - VM instance name
- `instance/zone` - Zone (e.g., us-central1-a)
- `instance/attributes/gpu-type` - Custom GPU type metadata
- `instance/attributes/gpu-count` - Custom GPU count metadata
- `instance/preempted` - Preemption status (for Spot VMs)

## Health Check

```bash
curl http://localhost:8090/health
```

Response:
```json
{
  "status": "healthy",
  "registered": true,
  "capacity_unit_id": "cap_abc123",
  "instance": "xidr-gpu-1"
}
```
