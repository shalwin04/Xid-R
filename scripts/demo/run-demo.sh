#!/bin/bash
# =============================================================================
# Xid-R Demo Runner
# =============================================================================
# Runs the complete demo flow for video recording
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_step() { echo -e "${CYAN}${BOLD}[STEP]${NC} $1"; }

clear
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║                                                                  ║${NC}"
echo -e "${BOLD}${CYAN}║                    Xid-R Demo Runner                             ║${NC}"
echo -e "${BOLD}${CYAN}║                                                                  ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# Check Prerequisites
# =============================================================================

log_step "Checking prerequisites..."

# Check if backend is running
if ! curl -s http://localhost:8080/health > /dev/null 2>&1; then
    log_warn "Backend not running. Start it with: npm run dev"
    echo ""
    echo "In another terminal, run:"
    echo "  cd $PROJECT_ROOT && npm run dev"
    echo ""
    exit 1
fi

log_info "✓ Backend is running"
echo ""

# =============================================================================
# Demo Menu
# =============================================================================

echo "Select demo mode:"
echo ""
echo "  1) Local Demo (simulated GPUs)"
echo "     - Uses local capacity pool"
echo "     - No GCP required"
echo ""
echo "  2) GCP Demo (Compute Engine VMs)"
echo "     - Uses real Spot VMs"
echo "     - Requires GCP project"
echo ""
read -p "Choice [1]: " choice
choice=${choice:-1}

case $choice in
    1)
        log_step "Running Local Demo..."
        echo ""

        # Start demo agent
        log_info "Starting demo agent..."
        cd "$PROJECT_ROOT"
        npx tsx scripts/demo/demo-agent.ts
        ;;

    2)
        log_step "Running GCP Demo..."
        echo ""

        # Check gcloud
        if ! command -v gcloud &> /dev/null; then
            log_warn "gcloud CLI not found"
            exit 1
        fi

        # Create VMs
        log_info "Setting up GCP VMs..."
        "$SCRIPT_DIR/setup-demo-vms.sh" create
        "$SCRIPT_DIR/setup-demo-vms.sh" install-all

        echo ""
        log_info "VMs ready! Starting demo agent..."
        echo ""

        # Start demo agent
        cd "$PROJECT_ROOT"
        npx tsx scripts/demo/demo-agent.ts &
        AGENT_PID=$!

        echo ""
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo "Demo agent running (PID: $AGENT_PID)"
        echo ""
        echo "To simulate preemption, run in another terminal:"
        echo "  $SCRIPT_DIR/setup-demo-vms.sh preempt xidr-gpu-1"
        echo ""
        echo "Press Ctrl+C to stop"
        echo ""
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

        wait $AGENT_PID

        # Cleanup
        log_info "Cleaning up VMs..."
        "$SCRIPT_DIR/setup-demo-vms.sh" cleanup
        ;;

    *)
        log_warn "Invalid choice"
        exit 1
        ;;
esac
