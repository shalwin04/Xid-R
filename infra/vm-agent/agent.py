#!/usr/bin/env python3
"""
Xid-R VM Agent

A lightweight agent that runs on Compute Engine VMs to:
- Register GPU capacity with the Xid-R control plane
- Monitor for Spot VM preemption notices
- Report status via heartbeats
- Handle preemption gracefully

Usage:
    python agent.py --api-endpoint https://api.xidr.io --org-id <ORG_ID>

Environment Variables:
    XIDR_API_ENDPOINT - Control plane URL (default: http://localhost:8080)
    XIDR_ORG_ID - Organization ID (default: demo-org)
    XIDR_API_KEY - API key for authentication
    GPU_TYPE - Simulated GPU type (default: nvidia-t4)
    GPU_COUNT - Simulated GPU count (default: 1)
"""

import os
import sys
import time
import json
import signal
import argparse
import threading
from urllib import request, error
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler

# Configuration
METADATA_URL = "http://metadata.google.internal/computeMetadata/v1"
METADATA_HEADERS = {"Metadata-Flavor": "Google"}
HEARTBEAT_INTERVAL = 30  # seconds
PREEMPTION_POLL_INTERVAL = 5  # seconds
HEALTH_PORT = 8090

class Colors:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    MAGENTA = '\033[95m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def log(level, message):
    timestamp = datetime.now().strftime("%H:%M:%S")
    colors = {
        "INFO": Colors.GREEN,
        "WARN": Colors.YELLOW,
        "ERROR": Colors.RED,
        "EVENT": Colors.CYAN,
        "HEART": Colors.MAGENTA
    }
    color = colors.get(level, Colors.RESET)
    print(f"{Colors.BOLD}[{timestamp}]{Colors.RESET} {color}[{level}]{Colors.RESET} {message}")

def get_metadata(path):
    """Fetch metadata from GCP metadata server."""
    try:
        url = f"{METADATA_URL}/{path}"
        req = request.Request(url, headers=METADATA_HEADERS)
        with request.urlopen(req, timeout=5) as response:
            return response.read().decode('utf-8')
    except Exception:
        return None

def get_instance_info():
    """Get instance information from metadata server."""
    info = {
        "instance_name": get_metadata("instance/name"),
        "instance_id": get_metadata("instance/id"),
        "zone": get_metadata("instance/zone"),
        "machine_type": get_metadata("instance/machine-type"),
        "project_id": get_metadata("project/project-id"),
        "external_ip": get_metadata("instance/network-interfaces/0/access-configs/0/external-ip"),
        "internal_ip": get_metadata("instance/network-interfaces/0/ip"),
    }

    # Get custom metadata (gpu-type, gpu-count)
    info["gpu_type"] = get_metadata("instance/attributes/gpu-type") or "nvidia-t4"
    info["gpu_count"] = int(get_metadata("instance/attributes/gpu-count") or "1")

    # Extract zone name from full path
    if info["zone"]:
        info["zone"] = info["zone"].split("/")[-1]
    if info["machine_type"]:
        info["machine_type"] = info["machine_type"].split("/")[-1]

    return info

def check_preemption():
    """Check if this instance is being preempted."""
    preempted = get_metadata("instance/preempted")
    maintenance = get_metadata("instance/maintenance-event")
    return preempted == "TRUE" or maintenance is not None


class HealthHandler(BaseHTTPRequestHandler):
    """Simple HTTP handler for health checks."""

    agent = None  # Will be set by XidrAgent

    def log_message(self, format, *args):
        pass  # Suppress default logging

    def do_GET(self):
        if self.path == "/health":
            response = {
                "status": "healthy",
                "registered": self.agent.registered if self.agent else False,
                "capacity_unit_id": self.agent.capacity_unit_id if self.agent else None,
                "instance": self.agent.instance_info.get("instance_name") if self.agent else None,
            }
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_response(404)
            self.end_headers()


class XidrAgent:
    def __init__(self, api_endpoint, org_id, api_key=None):
        self.api_endpoint = api_endpoint.rstrip("/")
        self.org_id = org_id
        self.api_key = api_key
        self.instance_info = {}
        self.capacity_unit_id = None
        self.running = True
        self.registered = False
        self.preemption_reported = False

    def api_call(self, method, path, data=None):
        """Make an API call to the control plane."""
        url = f"{self.api_endpoint}{path}"
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        try:
            body = json.dumps(data).encode('utf-8') if data else None
            req = request.Request(url, data=body, headers=headers, method=method)
            with request.urlopen(req, timeout=30) as response:
                return json.loads(response.read().decode('utf-8'))
        except error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            log("ERROR", f"API error {e.code}: {error_body[:200]}")
            return None
        except Exception as e:
            log("ERROR", f"API call failed: {e}")
            return None

    def register_capacity(self):
        """Register this VM as a capacity unit with the control plane."""
        self.instance_info = get_instance_info()

        # Check if running on GCP
        if not self.instance_info["instance_name"]:
            log("WARN", "Not running on GCP, using mock data for local testing")
            self.instance_info = {
                "instance_name": f"local-vm-{os.getpid()}",
                "instance_id": str(os.getpid()),
                "zone": "us-central1-a",
                "machine_type": "e2-small",
                "project_id": os.environ.get("GCP_PROJECT_ID", "xid-r-development"),
                "external_ip": "127.0.0.1",
                "internal_ip": "127.0.0.1",
                "gpu_type": os.environ.get("GPU_TYPE", "nvidia-t4"),
                "gpu_count": int(os.environ.get("GPU_COUNT", "1")),
            }

        log("INFO", f"╔══════════════════════════════════════════╗")
        log("INFO", f"║  Instance: {self.instance_info['instance_name']:<28} ║")
        log("INFO", f"║  Zone: {self.instance_info['zone']:<32} ║")
        log("INFO", f"║  GPU: {self.instance_info['gpu_type']} x{self.instance_info['gpu_count']:<24} ║")
        log("INFO", f"╚══════════════════════════════════════════╝")

        # Register with control plane
        data = {
            "type": "spot_vm",
            "project_id": self.instance_info["project_id"],
            "zone": self.instance_info["zone"],
            "gpu_type": self.instance_info["gpu_type"],
            "memory_gb": 16,
            "on_demand_hourly_usd": 0.35,
            "instance_name": self.instance_info["instance_name"],
        }

        result = self.api_call("POST", "/api/capacity/register", data)

        if result and "capacity_unit" in result:
            self.capacity_unit_id = result["capacity_unit"]["id"]
            self.registered = True
            log("INFO", f"✓ Registered as: {self.capacity_unit_id}")
            return True
        else:
            log("ERROR", "Failed to register with control plane")
            return False

    def send_heartbeat(self):
        """Send heartbeat with current status."""
        if not self.capacity_unit_id:
            return False

        data = {
            "capacity_unit_id": self.capacity_unit_id,
            "status": "available",
            "utilization_percent": 0,
        }

        result = self.api_call("POST", "/api/capacity/heartbeat", data)
        if result:
            log("HEART", f"♥ Heartbeat OK (unit: {self.capacity_unit_id[:16]}...)")
            return True
        return False

    def report_preemption(self):
        """Report preemption to control plane."""
        if self.preemption_reported:
            return

        log("EVENT", "")
        log("EVENT", "╔══════════════════════════════════════════╗")
        log("EVENT", "║  🚨 PREEMPTION DETECTED!                 ║")
        log("EVENT", "╚══════════════════════════════════════════╝")
        log("EVENT", "")

        if not self.capacity_unit_id:
            return

        data = {
            "capacity_unit_id": self.capacity_unit_id,
            "event_type": "preemption",
            "reason": "spot_preemption",
            "grace_period_seconds": 30,
        }

        result = self.api_call("POST", "/api/capacity/preemption", data)
        if result:
            log("EVENT", "✓ Preemption reported to control plane")
            self.preemption_reported = True

    def heartbeat_loop(self):
        """Background thread for sending heartbeats."""
        while self.running:
            if self.registered:
                self.send_heartbeat()
            time.sleep(HEARTBEAT_INTERVAL)

    def preemption_monitor_loop(self):
        """Background thread for monitoring preemption."""
        while self.running:
            if check_preemption():
                self.report_preemption()
                time.sleep(5)
                break
            time.sleep(PREEMPTION_POLL_INTERVAL)

    def health_server_loop(self):
        """Background thread for health check server."""
        HealthHandler.agent = self
        server = HTTPServer(("0.0.0.0", HEALTH_PORT), HealthHandler)
        log("INFO", f"Health server on port {HEALTH_PORT}")
        server.serve_forever()

    def run(self):
        """Main agent loop."""
        print("")
        log("INFO", "╔══════════════════════════════════════════╗")
        log("INFO", "║       Xid-R VM Agent Starting            ║")
        log("INFO", "╚══════════════════════════════════════════╝")
        log("INFO", f"Control Plane: {self.api_endpoint}")
        log("INFO", f"Organization: {self.org_id}")
        print("")

        # Register with control plane
        if not self.register_capacity():
            log("ERROR", "Failed to register, will retry...")
            # Retry loop
            for i in range(5):
                time.sleep(5)
                log("INFO", f"Retry {i+1}/5...")
                if self.register_capacity():
                    break
            else:
                log("ERROR", "Failed to register after 5 attempts, exiting")
                return 1

        # Start background threads
        threads = [
            threading.Thread(target=self.heartbeat_loop, daemon=True, name="heartbeat"),
            threading.Thread(target=self.preemption_monitor_loop, daemon=True, name="preemption"),
            threading.Thread(target=self.health_server_loop, daemon=True, name="health"),
        ]

        for t in threads:
            t.start()

        print("")
        log("INFO", "Agent running. Waiting for events...")
        log("INFO", "Press Ctrl+C to stop.")
        print("")

        # Handle shutdown
        def signal_handler(sig, frame):
            print("")
            log("INFO", "Shutting down...")
            self.running = False
            sys.exit(0)

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        # Keep main thread alive
        while self.running:
            time.sleep(1)

        return 0


def main():
    parser = argparse.ArgumentParser(
        description="Xid-R VM Agent - Reports GPU capacity to control plane",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Local development
  python agent.py --api-endpoint http://localhost:8080

  # Production
  python agent.py --api-endpoint https://api.xidr.io --org-id my-org --api-key sk-xxx

  # With custom GPU type
  GPU_TYPE=nvidia-l4 GPU_COUNT=2 python agent.py
        """
    )
    parser.add_argument(
        "--api-endpoint",
        default=os.environ.get("XIDR_API_ENDPOINT", "http://localhost:8080"),
        help="Xid-R control plane API endpoint"
    )
    parser.add_argument(
        "--org-id",
        default=os.environ.get("XIDR_ORG_ID", "demo-org"),
        help="Organization ID"
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("XIDR_API_KEY"),
        help="API key for authentication"
    )

    args = parser.parse_args()

    agent = XidrAgent(args.api_endpoint, args.org_id, args.api_key)
    return agent.run()


if __name__ == "__main__":
    sys.exit(main())
