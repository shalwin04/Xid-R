#!/bin/bash
# =============================================================================
# Xid-R GCP Infrastructure Setup
# =============================================================================
# This script sets up the production GCP infrastructure for Xid-R demo
# Estimated cost: $30-50 for demo recording session
# =============================================================================

set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-xid-r-demo}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${GCP_ZONE:-us-central1-a}"
CLUSTER_NAME="xidr-cluster"
GPU_POOL_NAME="gpu-pool"
SERVICE_ACCOUNT_NAME="xidr-service-account"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Pre-flight Checks
# =============================================================================

preflight_checks() {
    log_info "Running pre-flight checks..."

    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi

    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Install: gcloud components install kubectl"
        exit 1
    fi

    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n1 > /dev/null; then
        log_error "Not authenticated. Run: gcloud auth login"
        exit 1
    fi

    gcloud config set project "$PROJECT_ID" 2>/dev/null || {
        log_error "Failed to set project. Does project '$PROJECT_ID' exist?"
        exit 1
    }

    log_info "Pre-flight checks passed!"
}

# =============================================================================
# Enable APIs
# =============================================================================

enable_apis() {
    log_info "Enabling required GCP APIs..."

    apis=(
        "container.googleapis.com"
        "compute.googleapis.com"
        "run.googleapis.com"
        "firestore.googleapis.com"
        "monitoring.googleapis.com"
        "cloudresourcemanager.googleapis.com"
        "iam.googleapis.com"
        "artifactregistry.googleapis.com"
        "secretmanager.googleapis.com"
    )

    for api in "${apis[@]}"; do
        log_info "  Enabling $api..."
        gcloud services enable "$api" --quiet
    done

    log_info "All APIs enabled!"
}

# =============================================================================
# Create Service Account
# =============================================================================

create_service_account() {
    log_info "Creating service account..."

    SA_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

    if ! gcloud iam service-accounts describe "$SA_EMAIL" &>/dev/null; then
        gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
            --display-name="Xid-R Service Account" \
            --description="Service account for Xid-R GPU broker"
    fi

    roles=(
        "roles/container.admin"
        "roles/compute.admin"
        "roles/run.admin"
        "roles/datastore.user"
        "roles/monitoring.viewer"
        "roles/iam.serviceAccountUser"
    )

    for role in "${roles[@]}"; do
        log_info "  Granting $role..."
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:$SA_EMAIL" \
            --role="$role" \
            --quiet 2>/dev/null || true
    done

    KEY_FILE="./xidr-sa-key.json"
    if [ ! -f "$KEY_FILE" ]; then
        log_info "Creating service account key..."
        gcloud iam service-accounts keys create "$KEY_FILE" \
            --iam-account="$SA_EMAIL"
        log_warn "Service account key saved to $KEY_FILE"
    fi

    log_info "Service account configured!"
}

# =============================================================================
# Create GKE Cluster (Standard with GPU support)
# =============================================================================

create_gke_cluster() {
    log_info "Creating GKE cluster..."

    if gcloud container clusters describe "$CLUSTER_NAME" --zone="$ZONE" &>/dev/null; then
        log_info "Cluster already exists, getting credentials..."
        gcloud container clusters get-credentials "$CLUSTER_NAME" --zone="$ZONE"
        return
    fi

    log_info "Creating GKE Standard cluster with GPU support (5-10 minutes)..."
    
    gcloud container clusters create "$CLUSTER_NAME" \
        --zone="$ZONE" \
        --num-nodes=1 \
        --machine-type="e2-medium" \
        --release-channel=rapid \
        --enable-ip-alias \
        --workload-pool="${PROJECT_ID}.svc.id.goog"

    gcloud container clusters get-credentials "$CLUSTER_NAME" --zone="$ZONE"
    log_info "GKE cluster created!"
}

# =============================================================================
# Create GPU Node Pool
# =============================================================================

create_gpu_node_pool() {
    log_info "Creating GPU node pool with T4 GPUs..."

    if gcloud container node-pools describe "$GPU_POOL_NAME" \
        --cluster="$CLUSTER_NAME" --zone="$ZONE" &>/dev/null; then
        log_info "GPU node pool already exists, skipping"
        return
    fi

    gcloud container node-pools create "$GPU_POOL_NAME" \
        --cluster="$CLUSTER_NAME" \
        --zone="$ZONE" \
        --machine-type="n1-standard-4" \
        --accelerator="type=nvidia-tesla-t4,count=1" \
        --num-nodes=1 \
        --min-nodes=0 \
        --max-nodes=2 \
        --enable-autoscaling \
        --spot \
        --node-taints="nvidia.com/gpu=present:NoSchedule"

    # Install NVIDIA GPU drivers
    kubectl apply -f https://raw.githubusercontent.com/GoogleCloudPlatform/container-engine-accelerators/master/nvidia-driver-installer/cos/daemonset-preloaded.yaml

    log_info "GPU node pool created!"
}

# =============================================================================
# Create Spot VM with GPU
# =============================================================================

create_spot_vm() {
    log_info "Creating Spot VM with T4 GPU..."

    SPOT_VM_NAME="xidr-spot-gpu-1"

    if gcloud compute instances describe "$SPOT_VM_NAME" --zone="$ZONE" &>/dev/null; then
        log_info "Spot VM already exists"
        return
    fi

    gcloud compute instances create "$SPOT_VM_NAME" \
        --zone="$ZONE" \
        --machine-type="n1-standard-4" \
        --accelerator="type=nvidia-tesla-t4,count=1" \
        --maintenance-policy=TERMINATE \
        --provisioning-model=SPOT \
        --instance-termination-action=STOP \
        --image-family="pytorch-latest-gpu" \
        --image-project="deeplearning-platform-release" \
        --boot-disk-size="100GB" \
        --boot-disk-type="pd-ssd" \
        --metadata="install-nvidia-driver=True" \
        --scopes="cloud-platform"

    log_info "Spot VM created: $SPOT_VM_NAME"
}

# =============================================================================
# Setup Firestore
# =============================================================================

setup_firestore() {
    log_info "Setting up Firestore..."

    gcloud firestore databases create \
        --location="$REGION" \
        --type=firestore-native \
        2>/dev/null || log_info "Firestore database already exists"

    log_info "Firestore configured!"
}

# =============================================================================
# Setup Budget Alert
# =============================================================================

setup_budget_alert() {
    log_info "Setting up budget alert at \$50..."

    BILLING_ACCOUNT=$(gcloud billing projects describe "$PROJECT_ID" \
        --format="value(billingAccountName)" 2>/dev/null | cut -d'/' -f2)

    if [ -n "$BILLING_ACCOUNT" ]; then
        gcloud billing budgets create \
            --billing-account="$BILLING_ACCOUNT" \
            --display-name="Xid-R Demo Budget" \
            --budget-amount=50USD \
            --threshold-rule=percent=0.5,basis=current-spend \
            --threshold-rule=percent=0.9,basis=current-spend \
            2>/dev/null || log_info "Budget may already exist"

        log_info "Budget alert configured!"
    else
        log_warn "Could not configure budget alert"
    fi
}

# =============================================================================
# Scale GPU Nodes
# =============================================================================

scale_gpu_nodes() {
    local count="${1:-1}"
    log_info "Scaling GPU node pool to $count nodes..."

    gcloud container clusters resize "$CLUSTER_NAME" \
        --node-pool="$GPU_POOL_NAME" \
        --zone="$ZONE" \
        --num-nodes="$count" \
        --quiet

    log_info "GPU nodes scaled to $count"
}

# =============================================================================
# Print Summary
# =============================================================================

print_summary() {
    echo ""
    echo "============================================================"
    echo "  Xid-R GCP Infrastructure Setup Complete!"
    echo "============================================================"
    echo ""
    echo "Resources Created:"
    echo "  - GKE Cluster:  $CLUSTER_NAME"
    echo "  - GPU Pool:     $GPU_POOL_NAME (T4, Spot)"
    echo "  - Spot VM:      xidr-spot-gpu-1 (T4)"
    echo "  - Firestore:    Native mode database"
    echo ""
    echo "Next Steps:"
    echo "  1. Set: export GOOGLE_APPLICATION_CREDENTIALS=./xidr-sa-key.json"
    echo "  2. Run: npm run dev"
    echo "  3. Dashboard: http://localhost:3000"
    echo ""
    echo "Scale GPU nodes:"
    echo "  ./infra/gcp-setup.sh scale 0  # Scale down to save cost"
    echo "  ./infra/gcp-setup.sh scale 2  # Scale up for demo"
    echo ""
    echo "Cleanup when done:"
    echo "  ./infra/gcp-setup.sh cleanup"
    echo ""
    echo "============================================================"
}

# =============================================================================
# Cleanup
# =============================================================================

cleanup() {
    log_warn "Cleaning up all resources..."

    gcloud compute instances delete "xidr-spot-gpu-1" \
        --zone="$ZONE" --quiet 2>/dev/null || true

    gcloud container clusters delete "$CLUSTER_NAME" \
        --zone="$ZONE" --quiet 2>/dev/null || true

    log_info "Cleanup complete!"
}

# =============================================================================
# Main
# =============================================================================

case "${1:-setup}" in
    setup)
        preflight_checks
        enable_apis
        create_service_account
        create_gke_cluster
        create_gpu_node_pool
        create_spot_vm
        setup_firestore
        setup_budget_alert
        print_summary
        ;;
    scale)
        scale_gpu_nodes "${2:-1}"
        ;;
    cleanup)
        cleanup
        ;;
    *)
        echo "Usage: $0 {setup|scale [count]|cleanup}"
        exit 1
        ;;
esac
