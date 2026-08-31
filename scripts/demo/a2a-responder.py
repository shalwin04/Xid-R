#!/usr/bin/env python3
"""
Xid-R A2A Responder for Cloud Demo
Shows live A2A negotiation with detailed visual output
"""

import json
import os
import time
import threading
import urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

PORT = int(os.environ.get("A2A_PORT", "8091"))
API_URL = os.environ.get("XIDR_API_ENDPOINT", "https://xidr-api-612886611684.us-central1.run.app")

class Colors:
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    RESET = '\033[0m'
    BOLD = '\033[1m'
    DIM = '\033[2m'
    BG_RED = '\033[41m'
    BG_GREEN = '\033[42m'
    BG_BLUE = '\033[44m'
    BG_CYAN = '\033[46m'

def log(level, msg):
    ts = datetime.now().strftime("%H:%M:%S")
    colors = {
        "INFO": Colors.GREEN,
        "A2A": Colors.CYAN,
        "WARN": Colors.YELLOW,
        "TRAIN": Colors.MAGENTA
    }
    color = colors.get(level, Colors.RESET)
    print(f"{Colors.BOLD}[{ts}]{Colors.RESET} {color}[{level}]{Colors.RESET} {msg}", flush=True)

class A2AHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress default logging

    def do_POST(self):
        if "/a2a/tasks" in self.path:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')

            try:
                data = json.loads(body)
                task_type = data.get("task_type", "")
                task_data = data.get("data", {})

                # Show incoming A2A message
                print("", flush=True)
                print("", flush=True)
                log("A2A", f"{Colors.BG_BLUE}{Colors.BOLD} ◀◀◀ INCOMING A2A MESSAGE ◀◀◀ {Colors.RESET}")
                log("A2A", f"{Colors.DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{Colors.RESET}")
                log("A2A", f"{Colors.CYAN}From:{Colors.RESET} Xid-R Control Plane (Negotiator Agent)")
                log("A2A", f"{Colors.CYAN}Task Type:{Colors.RESET} {task_type}")
                log("A2A", f"{Colors.CYAN}Payload:{Colors.RESET}")
                for line in json.dumps(task_data, indent=2).split('\n'):
                    print(f"  {Colors.DIM}{line}{Colors.RESET}", flush=True)
                log("A2A", f"{Colors.DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{Colors.RESET}")

                if task_type == "reclaim_request":
                    lease_id = task_data.get("lease_id", "unknown")
                    reason = task_data.get("reason", "unknown")
                    grace = task_data.get("grace_period_seconds", 120)
                    options = task_data.get("options", [])

                    # Show training paused
                    print("", flush=True)
                    log("TRAIN", f"{Colors.BG_RED}{Colors.BOLD} ⏸️  TRAINING PAUSED - PREEMPTION SIGNAL {Colors.RESET}")

                    print("", flush=True)
                    log("A2A", "╔══════════════════════════════════════════════════════════╗")
                    log("A2A", f"║  {Colors.BG_RED}{Colors.BOLD} ⚠️  PREEMPTION NOTICE RECEIVED! {Colors.RESET}                       ║")
                    log("A2A", "╚══════════════════════════════════════════════════════════╝")
                    print("", flush=True)

                    # Step 1: Analyze
                    log("A2A", f"{Colors.YELLOW}[Step 1/4]{Colors.RESET} Analyzing reclaim request...")
                    time.sleep(0.8)
                    log("A2A", f"  • Lease ID: {Colors.CYAN}{lease_id}{Colors.RESET}")
                    log("A2A", f"  • Reason: {Colors.RED}{reason}{Colors.RESET}")
                    log("A2A", f"  • Grace Period: {Colors.YELLOW}{grace}s{Colors.RESET}")
                    print("", flush=True)

                    # Step 2: Evaluate options
                    log("A2A", f"{Colors.YELLOW}[Step 2/4]{Colors.RESET} Evaluating available actions...")
                    time.sleep(0.8)
                    for opt in options:
                        action = opt.get("action", "unknown")
                        target = opt.get("target", "")
                        if action == "checkpoint":
                            log("A2A", f"  {Colors.GREEN}✓ checkpoint{Colors.RESET} → {target[:50]}...")
                        elif action == "migrate":
                            log("A2A", f"  {Colors.BLUE}↗ migrate{Colors.RESET} → {target}")
                        else:
                            log("A2A", f"  {Colors.RED}✗ {action}{Colors.RESET}")
                    print("", flush=True)

                    # Step 3: Execute checkpoint
                    log("A2A", f"{Colors.YELLOW}[Step 3/4]{Colors.RESET} {Colors.BOLD}Choosing action: CHECKPOINT{Colors.RESET}")
                    time.sleep(0.5)
                    print("", flush=True)

                    log("A2A", f"{Colors.CYAN}Serializing agent state...{Colors.RESET}")
                    time.sleep(0.6)
                    log("A2A", f"  {Colors.GREEN}✓{Colors.RESET} Model weights: 100 parameters")
                    time.sleep(0.3)
                    log("A2A", f"  {Colors.GREEN}✓{Colors.RESET} Training state: epoch 8/30")
                    time.sleep(0.3)
                    log("A2A", f"  {Colors.GREEN}✓{Colors.RESET} Current loss: 0.3706")
                    time.sleep(0.3)
                    log("A2A", f"  {Colors.GREEN}✓{Colors.RESET} Total size: 2.0 KB")
                    print("", flush=True)

                    checkpoint_uri = f"gs://xidr-demo-checkpoints/{lease_id}/checkpoint.json"

                    log("A2A", f"{Colors.CYAN}Uploading to Google Cloud Storage...{Colors.RESET}")
                    time.sleep(0.8)
                    log("A2A", f"  {Colors.GREEN}✓{Colors.RESET} Saved to: {Colors.DIM}{checkpoint_uri}{Colors.RESET}")
                    print("", flush=True)

                    # Prepare response
                    response_data = {
                        "chosen_action": "checkpoint",
                        "checkpoint_uri": checkpoint_uri,
                        "estimated_duration_seconds": 5
                    }

                    # Send HTTP response first
                    response = {"status": "completed", "data": response_data}
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps(response).encode())

                    # Step 4: Notify control plane (in background)
                    def complete_checkpoint():
                        log("A2A", f"{Colors.YELLOW}[Step 4/4]{Colors.RESET} Sending checkpoint acknowledgment to Control Plane...")
                        time.sleep(0.5)

                        ack_data = json.dumps({
                            "lease_id": lease_id,
                            "checkpoint_uri": checkpoint_uri,
                            "size_bytes": 2048,
                            "duration_ms": 2000
                        }).encode()

                        req = urllib.request.Request(
                            f"{API_URL}/mcp/tools/xidr_checkpoint_ack",
                            data=ack_data,
                            headers={"Content-Type": "application/json"}
                        )
                        try:
                            urllib.request.urlopen(req, timeout=10)
                            log("A2A", f"  {Colors.GREEN}✓{Colors.RESET} Control Plane notified")
                        except Exception as e:
                            log("WARN", f"Failed to notify: {e}")

                        print("", flush=True)
                        log("A2A", "╔══════════════════════════════════════════════════════════╗")
                        log("A2A", f"║  {Colors.BG_GREEN}{Colors.BOLD} ✓ CHECKPOINT COMPLETE - GPU RELEASED {Colors.RESET}                  ║")
                        log("A2A", "╚══════════════════════════════════════════════════════════╝")
                        log("A2A", f"{Colors.DIM}Agent can resume on new GPU with preserved state{Colors.RESET}")
                        print("", flush=True)

                        # Show outgoing response
                        log("A2A", f"{Colors.BG_GREEN}{Colors.BOLD} ▶▶▶ OUTGOING A2A RESPONSE ▶▶▶ {Colors.RESET}")
                        log("A2A", f"{Colors.DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{Colors.RESET}")
                        log("A2A", f"{Colors.GREEN}To:{Colors.RESET} Xid-R Control Plane")
                        log("A2A", f"{Colors.GREEN}Status:{Colors.RESET} completed")
                        log("A2A", f"{Colors.GREEN}Response:{Colors.RESET}")
                        for line in json.dumps(response_data, indent=2).split('\n'):
                            print(f"  {Colors.DIM}{line}{Colors.RESET}", flush=True)
                        log("A2A", f"{Colors.DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{Colors.RESET}")
                        print("", flush=True)
                        print("", flush=True)
                        log("INFO", "Waiting for next preemption request...")
                        print("", flush=True)

                    threading.Thread(target=complete_checkpoint).start()
                    return

            except Exception as e:
                log("WARN", f"Error processing request: {e}")

            self.send_response(400)
            self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"healthy"}')
        else:
            self.send_response(404)
            self.end_headers()

def main():
    print("", flush=True)
    print(f"{Colors.BOLD}{Colors.CYAN}╔══════════════════════════════════════════════════════════╗{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}║                                                          ║{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}║      🤖 Xid-R A2A Responder - Cloud GPU Agent           ║{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}║                                                          ║{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}╚══════════════════════════════════════════════════════════╝{Colors.RESET}")
    print("", flush=True)
    log("INFO", f"Control Plane: {API_URL}")
    log("INFO", f"A2A Endpoint: http://0.0.0.0:{PORT}")
    print("", flush=True)
    log("INFO", "Waiting for preemption requests...")
    print("", flush=True)

    server = HTTPServer(("0.0.0.0", PORT), A2AHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("", flush=True)
        log("INFO", "Shutting down...")
        server.shutdown()

if __name__ == "__main__":
    main()
