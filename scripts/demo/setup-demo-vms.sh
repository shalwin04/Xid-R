#!/bin/bash
# =============================================================================
# Xid-R Demo VM Setup
# =============================================================================
# Creates Spot VMs for the Compute Engine demo
# Cost: ~$0.01/hr per VM
# =============================================================================

set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-xid-r-development}"
ZONE="${GCP_ZONE:-us-central1-a}"
MACHINE_TYPE="e2-small"
XIDR_API="${XIDR_API_ENDPOINT:-http://localhost:8080}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Create Demo VMs
# =============================================================================

create_demo_vms() {
    log_info "Creating demo Spot VMs..."
    log_info "Project: $PROJECT_ID"
    log_info "Zone: $ZONE"
    echo ""

    # VM 1: nvidia-t4 "GPU"
    log_info "Creating xidr-gpu-1 (nvidia-t4)..."
    gcloud compute instances create xidr-gpu-1 \
        --project="$PROJECT_ID" \
        --zone="$ZONE" \
        --machine-type="$MACHINE_TYPE" \
        --provisioning-model=SPOT \
        --instance-termination-action=STOP \
        --metadata="gpu-type=nvidia-t4,gpu-count=1" \
        --tags=xidr-node,demo \
        --scopes=cloud-platform \
        --image-family=debian-12 \
        --image-project=debian-cloud \
        --boot-disk-size=10GB \
        --quiet 2>/dev/null || log_warn "xidr-gpu-1 may already exist"

    # VM 2: nvidia-l4 "GPU"
    log_info "Creating xidr-gpu-2 (nvidia-l4)..."
    gcloud compute instances create xidr-gpu-2 \
        --project="$PROJECT_ID" \
        --zone="$ZONE" \
        --machine-type="$MACHINE_TYPE" \
        --provisioning-model=SPOT \
        --instance-termination-action=STOP \
        --metadata="gpu-type=nvidia-l4,gpu-count=1" \
        --tags=xidr-node,demo \
        --scopes=cloud-platform \
        --image-family=debian-12 \
        --image-project=debian-cloud \
        --boot-disk-size=10GB \
        --quiet 2>/dev/null || log_warn "xidr-gpu-2 may already exist"

    echo ""
    log_info "VMs created!"
}

# =============================================================================
# Install Agent on VMs
# =============================================================================

install_agent() {
    local vm_name=$1
    log_info "Installing Xid-R agent on $vm_name..."

    # Copy agent script
    gcloud compute scp \
        --project="$PROJECT_ID" \
        --zone="$ZONE" \
        "$(dirname "$0")/../../infra/vm-agent/agent.py" \
        "$vm_name:~/agent.py" \
        --quiet

    # Start agent in background
    gcloud compute ssh "$vm_name" \
        --project="$PROJECT_ID" \
        --zone="$ZONE" \
        --command="
            sudo apt-get update -qq && sudo apt-get install -y -qq python3 > /dev/null 2>&1
            export XIDR_API_ENDPOINT='$XIDR_API'
            nohup python3 ~/agent.py > ~/agent.log 2>&1 &
            echo 'Agent started, PID:' \$!
        " \
        --quiet

    log_info "Agent installed on $vm_name"
}

# =============================================================================
# List VMs
# =============================================================================

list_vms() {
    log_info "Demo VMs:"
    echo ""
    gcloud compute instances list \
        --project="$PROJECT_ID" \
        --filter="tags.items=xidr-node" \
        --format="table(name,zone,machineType,status,networkInterfaces[0].accessConfigs[0].natIP)"
}

# =============================================================================
# Cleanup
# =============================================================================

cleanup() {
    log_warn "Deleting demo VMs..."

    gcloud compute instances delete xidr-gpu-1 xidr-gpu-2 \
        --project="$PROJECT_ID" \
        --zone="$ZONE" \
        --quiet 2>/dev/null || true

    log_info "Cleanup complete"
}

# =============================================================================
# Trigger Preemption (for demo)
# =============================================================================

trigger_preemption() {
    local vm_name="${1:-xidr-gpu-1}"
    log_warn "Simulating preemption on $vm_name..."

    echo ""
    log_info "╔══════════════════════════════════════════════════════════╗"
    log_info "║  Stopping $vm_name to simulate Spot preemption...         ║"
    log_info "╚══════════════════════════════════════════════════════════╝"
    echo ""

    gcloud compute instances stop "$vm_name" \
        --project="$PROJECT_ID" \
        --zone="$ZONE" \
        --quiet

    log_info "VM stopped - preemption simulated!"
}

# =============================================================================
# Main
# =============================================================================

case "${1:-help}" in
    create)
        create_demo_vms
        ;;
    install)
        install_agent "${2:-xidr-gpu-1}"
        ;;
    install-all)
        install_agent "xidr-gpu-1"
        install_agent "xidr-gpu-2"
        ;;
    list)
        list_vms
        ;;
    preempt)
        trigger_preemption "${2:-xidr-gpu-1}"
        ;;
    cleanup)
        cleanup
        ;;
    *)
        echo "Xid-R Demo VM Setup"
        echo ""
        echo "Usage: $0 <command> [args]"
        echo ""
        echo "Commands:"
        echo "  create       Create demo Spot VMs"
        echo "  install      Install agent on a VM (default: xidr-gpu-1)"
        echo "  install-all  Install agent on all demo VMs"
        echo "  list         List demo VMs"
        echo "  preempt      Simulate preemption on a VM (default: xidr-gpu-1)"
        echo "  cleanup      Delete all demo VMs"
        echo ""
        echo "Environment:"
        echo "  GCP_PROJECT_ID    GCP project (default: xid-r-development)"
        echo "  GCP_ZONE          GCP zone (default: us-central1-a)"
        echo "  XIDR_API_ENDPOINT API endpoint (default: http://localhost:8080)"
        echo ""
        echo "Example workflow:"
        echo "  $0 create        # Create VMs"
        echo "  $0 install-all   # Install agents"
        echo "  $0 list          # Verify"
        echo "  $0 preempt       # Trigger demo preemption"
        echo "  $0 cleanup       # Clean up when done"
        ;;
esac
