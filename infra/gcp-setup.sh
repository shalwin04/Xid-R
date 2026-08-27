#!/bin/bash
# ============================================================================
# Xid-R GCP Production Setup
# ============================================================================
#
# This script sets up the complete GCP infrastructure for Xid-R:
# 1. GKE Autopilot cluster with GPU node pool
# 2. Spot VM with GPU (for preemption testing)
# 3. Cloud Run service (Self-Service Surface)
# 4. Firestore database
# 5. GCS bucket for checkpoints
# 6. Service accounts and IAM
#
# Prerequisites:
# - gcloud CLI installed and authenticated
# - Billing account linked
# - APIs enabled (run: gcloud services enable ...)
#
# Usage:
#   ./infra/gcp-setup.sh [PROJECT_ID] [REGION]
#
# Example:
#   ./infra/gcp-setup.sh xidr-hackathon us-central1
#
# ============================================================================

set -e  # Exit on error

# Configuration
PROJECT_ID="${1:-xidr-hackathon}"
REGION="${2:-us-central1}"
ZONE="${REGION}-a"

# Resource names
GKE_CLUSTER="xidr-cluster"
GKE_GPU_POOL="gpu-pool"
SPOT_VM_NAME="xidr-spot-gpu"
CLOUD_RUN_SERVICE="xidr-api"
GCS_BUCKET="xidr-checkpoints-${PROJECT_ID}"
FIRESTORE_DB="(default)"
SERVICE_ACCOUNT="xidr-service"

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║             Xid-R GCP Infrastructure Setup                    ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Project: ${PROJECT_ID}"
echo "Region:  ${REGION}"
echo "Zone:    ${ZONE}"
echo ""

# Confirm
read -p "Continue with setup? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Set project
echo ""
echo "=== Setting project ==="
gcloud config set project ${PROJECT_ID}

# Enable APIs
echo ""
echo "=== Enabling APIs ==="
gcloud services enable \
    container.googleapis.com \
    compute.googleapis.com \
    run.googleapis.com \
    firestore.googleapis.com \
    storage.googleapis.com \
    monitoring.googleapis.com \
    logging.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    aiplatform.googleapis.com

# Create service account
echo ""
echo "=== Creating service account ==="
gcloud iam service-accounts create ${SERVICE_ACCOUNT} \
    --display-name="Xid-R Service Account" \
    --description="Service account for Xid-R GPU broker" \
    2>/dev/null || echo "Service account already exists"

SA_EMAIL="${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant IAM roles
echo ""
echo "=== Granting IAM roles ==="
for role in \
    roles/container.developer \
    roles/compute.instanceAdmin.v1 \
    roles/run.invoker \
    roles/datastore.user \
    roles/storage.objectAdmin \
    roles/monitoring.viewer \
    roles/logging.logWriter
do
    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:${SA_EMAIL}" \
        --role="${role}" \
        --quiet
done

# Create GCS bucket for checkpoints
echo ""
echo "=== Creating GCS bucket ==="
gsutil mb -p ${PROJECT_ID} -l ${REGION} -c STANDARD gs://${GCS_BUCKET}/ 2>/dev/null || echo "Bucket already exists"
gsutil lifecycle set <(cat <<EOF
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {"age": 7}
    }
  ]
}
EOF
) gs://${GCS_BUCKET}/

# Initialize Firestore
echo ""
echo "=== Initializing Firestore ==="
gcloud firestore databases create \
    --location=${REGION} \
    --type=firestore-native \
    2>/dev/null || echo "Firestore already initialized"

# Create GKE Autopilot cluster
echo ""
echo "=== Creating GKE Autopilot cluster ==="
echo "This may take 5-10 minutes..."
gcloud container clusters create-auto ${GKE_CLUSTER} \
    --location=${REGION} \
    --project=${PROJECT_ID} \
    --enable-master-authorized-networks \
    --master-authorized-networks="0.0.0.0/0" \
    2>/dev/null || echo "Cluster already exists"

# Get cluster credentials
echo ""
echo "=== Getting cluster credentials ==="
gcloud container clusters get-credentials ${GKE_CLUSTER} \
    --location=${REGION} \
    --project=${PROJECT_ID}

# Note: GKE Autopilot doesn't require manual GPU node pool creation
# GPUs are provisioned on-demand when pods request them

# Create Spot VM with GPU
echo ""
echo "=== Creating Spot VM with GPU ==="
echo "This is for preemption testing..."

# Check if VM exists
if gcloud compute instances describe ${SPOT_VM_NAME} --zone=${ZONE} &>/dev/null; then
    echo "Spot VM already exists"
else
    gcloud compute instances create ${SPOT_VM_NAME} \
        --zone=${ZONE} \
        --machine-type=n1-standard-4 \
        --accelerator=type=nvidia-tesla-t4,count=1 \
        --maintenance-policy=TERMINATE \
        --provisioning-model=SPOT \
        --instance-termination-action=STOP \
        --image-family=ubuntu-2204-lts \
        --image-project=ubuntu-os-cloud \
        --boot-disk-size=100GB \
        --boot-disk-type=pd-ssd \
        --metadata=startup-script='#!/bin/bash
# Install NVIDIA drivers
sudo apt-get update
sudo apt-get install -y nvidia-driver-535
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Install nvidia-container-toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
' \
        --service-account=${SA_EMAIL} \
        --scopes=cloud-platform
fi

# Create Artifact Registry repository
echo ""
echo "=== Creating Artifact Registry ==="
gcloud artifacts repositories create xidr \
    --repository-format=docker \
    --location=${REGION} \
    --description="Xid-R container images" \
    2>/dev/null || echo "Repository already exists"

# Build and push container image
echo ""
echo "=== Building container image ==="
CONTAINER_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/xidr/api:latest"

# Configure Docker for Artifact Registry
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

# Build and push
docker build -t ${CONTAINER_IMAGE} .
docker push ${CONTAINER_IMAGE}

# Deploy to Cloud Run
echo ""
echo "=== Deploying to Cloud Run ==="
gcloud run deploy ${CLOUD_RUN_SERVICE} \
    --image=${CONTAINER_IMAGE} \
    --platform=managed \
    --region=${REGION} \
    --allow-unauthenticated \
    --service-account=${SA_EMAIL} \
    --set-env-vars="NODE_ENV=production,GCP_PROJECT=${PROJECT_ID},FIRESTORE_DATABASE=${FIRESTORE_DB},CHECKPOINT_BUCKET=${GCS_BUCKET}" \
    --memory=1Gi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=10 \
    --port=8080

# Get Cloud Run URL
CLOUD_RUN_URL=$(gcloud run services describe ${CLOUD_RUN_SERVICE} \
    --platform=managed \
    --region=${REGION} \
    --format='value(status.url)')

# Print summary
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                 Setup Complete!                                ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Resources Created:"
echo "  GKE Cluster:   ${GKE_CLUSTER} (${REGION})"
echo "  Spot VM:       ${SPOT_VM_NAME} (${ZONE})"
echo "  Cloud Run:     ${CLOUD_RUN_URL}"
echo "  GCS Bucket:    gs://${GCS_BUCKET}/"
echo "  Firestore:     ${FIRESTORE_DB}"
echo "  Service Acct:  ${SA_EMAIL}"
echo ""
echo "Next Steps:"
echo "  1. Set environment variables:"
echo "     export XIDR_API_URL=${CLOUD_RUN_URL}"
echo "     export GCP_PROJECT=${PROJECT_ID}"
echo "     export CHECKPOINT_BUCKET=${GCS_BUCKET}"
echo ""
echo "  2. Register capacity units:"
echo "     curl -X POST ${CLOUD_RUN_URL}/api/capacity/register \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"type\":\"spot_vm\",\"project_id\":\"${PROJECT_ID}\",\"zone\":\"${ZONE}\",\"gpu_type\":\"nvidia-t4\",\"memory_gb\":16,\"instance_name\":\"${SPOT_VM_NAME}\"}'"
echo ""
echo "  3. Run integration tests:"
echo "     XIDR_API_URL=${CLOUD_RUN_URL} npm run test:integration"
echo ""
echo "  4. Open dashboard:"
echo "     npm run web"
echo "     # Then visit http://localhost:3000"
echo ""
