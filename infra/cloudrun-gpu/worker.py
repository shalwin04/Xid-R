"""
Xid-R Cloud Run GPU Worker

This worker provides GPU capacity for AI agent workloads.
It exposes endpoints for:
- Health checks
- GPU info
- Task execution
- A2A communication
"""

import os
import json
import time
import threading
from flask import Flask, request, jsonify

app = Flask(__name__)

# Worker state
worker_state = {
    "status": "available",
    "current_lease_id": None,
    "tasks_completed": 0,
    "gpu_available": False,
    "started_at": time.time()
}

def check_gpu():
    """Check if GPU is available."""
    try:
        import torch
        if torch.cuda.is_available():
            worker_state["gpu_available"] = True
            worker_state["gpu_name"] = torch.cuda.get_device_name(0)
            worker_state["gpu_memory_gb"] = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            return True
    except Exception as e:
        print(f"GPU check failed: {e}")
    return False

# Check GPU on startup
check_gpu()

@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "gpu_available": worker_state["gpu_available"],
        "gpu_name": worker_state.get("gpu_name", "N/A"),
        "uptime_seconds": int(time.time() - worker_state["started_at"])
    })

@app.route("/gpu/info", methods=["GET"])
def gpu_info():
    """Get GPU information."""
    info = {
        "available": worker_state["gpu_available"],
        "type": worker_state.get("gpu_name", "unknown"),
        "memory_gb": worker_state.get("gpu_memory_gb", 0),
        "status": worker_state["status"],
        "current_lease_id": worker_state["current_lease_id"]
    }
    
    if worker_state["gpu_available"]:
        try:
            import torch
            info["memory_used_gb"] = torch.cuda.memory_allocated(0) / (1024**3)
            info["memory_free_gb"] = info["memory_gb"] - info["memory_used_gb"]
            info["utilization_percent"] = (info["memory_used_gb"] / info["memory_gb"]) * 100
        except:
            pass
    
    return jsonify(info)

@app.route("/lease/acquire", methods=["POST"])
def acquire_lease():
    """Acquire a lease on this GPU worker."""
    data = request.json or {}
    lease_id = data.get("lease_id")
    agent_id = data.get("agent_id")
    
    if worker_state["status"] != "available":
        return jsonify({
            "success": False,
            "error": "Worker is not available",
            "current_lease_id": worker_state["current_lease_id"]
        }), 409
    
    worker_state["status"] = "leased"
    worker_state["current_lease_id"] = lease_id
    worker_state["current_agent_id"] = agent_id
    worker_state["lease_acquired_at"] = time.time()
    
    return jsonify({
        "success": True,
        "lease_id": lease_id,
        "gpu_type": worker_state.get("gpu_name", "nvidia-l4"),
        "memory_gb": worker_state.get("gpu_memory_gb", 24)
    })

@app.route("/lease/release", methods=["POST"])
def release_lease():
    """Release the current lease."""
    data = request.json or {}
    lease_id = data.get("lease_id")
    
    if worker_state["current_lease_id"] != lease_id:
        return jsonify({
            "success": False,
            "error": "Lease ID mismatch"
        }), 400
    
    worker_state["status"] = "available"
    worker_state["current_lease_id"] = None
    worker_state["current_agent_id"] = None
    
    return jsonify({"success": True})

@app.route("/a2a", methods=["POST"])
def a2a_endpoint():
    """A2A protocol endpoint for negotiation."""
    data = request.json or {}
    task_type = data.get("task_type")
    
    if task_type == "reclaim_request":
        # Handle preemption/reclaim request
        return jsonify({
            "status": "accepted",
            "chosen_action": "checkpoint",
            "message": "Will checkpoint and release"
        })
    
    return jsonify({"status": "unknown_task_type"})

@app.route("/task/execute", methods=["POST"])
def execute_task():
    """Execute a GPU task."""
    data = request.json or {}
    task_type = data.get("type", "inference")
    
    if not worker_state["gpu_available"]:
        return jsonify({"error": "No GPU available"}), 503
    
    # Simulate GPU work
    try:
        import torch
        # Quick GPU operation to verify it works
        x = torch.randn(1000, 1000, device="cuda")
        y = torch.matmul(x, x)
        result_sum = y.sum().item()
        
        worker_state["tasks_completed"] += 1
        
        return jsonify({
            "success": True,
            "task_type": task_type,
            "result": f"GPU computation completed, sum={result_sum:.2f}",
            "tasks_completed": worker_state["tasks_completed"]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=True)
