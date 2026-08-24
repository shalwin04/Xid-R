#!/bin/bash
# Xid-R GCP Infrastructure Setup
# This script sets up the required GCP resources for Xid-R

set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-xidr-demo}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${GCP_ZONE:-us-central1-a}"

echo "=== Xid-R Infrastructure Setup ==="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Zone: $ZONE"
echo ""

# Check if gcloud is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n 1 > /dev/null 2>&1; then
    echo "Please authenticate with gcloud first:"
    echo "  gcloud auth login"
    exit 1
fi

# Set project
gcloud config set project "$PROJECT_ID"

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable \
    compute.googleapis.com \
    container.googleapis.com \
    run.googleapis.com \
    firestore.googleapis.com \
    storage.googleapis.com \
    monitoring.googleapis.com \
    cloudresourcemanager.googleapis.com \
    artifactregistry.googleapis.com

# Create Firestore database (if not exists)
echo "Setting up Firestore..."
if ! gcloud firestore databases describe --database="(default)" > /dev/null 2>&1; then
    gcloud firestore databases create --location="$REGION" --type=firestore-native
fi

# Create Cloud Storage bucket for checkpoints
BUCKET_NAME="${PROJECT_ID}-checkpoints"
echo "Creating checkpoint bucket: $BUCKET_NAME"
if ! gsutil ls "gs://$BUCKET_NAME" > /dev/null 2>&1; then
    gsutil mb -l "$REGION" "gs://$BUCKET_NAME"
    gsutil lifecycle set infrastructure/bucket-lifecycle.json "gs://$BUCKET_NAME"
fi

# Create Artifact Registry repository
echo "Creating Artifact Registry repository..."
if ! gcloud artifacts repositories describe xidr --location="$REGION" > /dev/null 2>&1; then
    gcloud artifacts repositories create xidr \
        --repository-format=docker \
        --location="$REGION" \
        --description="Xid-R container images"
fi

# Create GKE cluster (optional - for full demo)
read -p "Create GKE cluster with GPU node pool? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Creating GKE Autopilot cluster..."
    gcloud container clusters create-auto xidr-cluster \
        --region="$REGION" \
        --release-channel=rapid

    # Note: GPU node pools are auto-provisioned in Autopilot
    echo "GKE cluster created. GPU nodes will be auto-provisioned when needed."
fi

# Create Spot VM for testing (optional)
read -p "Create Spot VM with GPU for testing? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Creating Spot VM with T4 GPU..."
    gcloud compute instances create xidr-spot-gpu-1 \
        --zone="$ZONE" \
        --machine-type=n1-standard-4 \
        --accelerator=type=nvidia-tesla-t4,count=1 \
        --maintenance-policy=TERMINATE \
        --provisioning-model=SPOT \
        --image-family=debian-11 \
        --image-project=debian-cloud \
        --boot-disk-size=50GB \
        --metadata=startup-script='#!/bin/bash
            # Install NVIDIA drivers
            apt-get update
            apt-get install -y nvidia-driver-525
        '

    echo "Spot VM created. Note: It may take a few minutes for GPU drivers to install."
fi

# Create service account for Xid-R
echo "Creating service account..."
SA_NAME="xidr-service"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe "$SA_EMAIL" > /dev/null 2>&1; then
    gcloud iam service-accounts create "$SA_NAME" \
        --display-name="Xid-R Service Account"

    # Grant required permissions
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/datastore.user"

    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/storage.admin"

    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/monitoring.viewer"

    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/compute.viewer"

    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/container.viewer"

    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/run.invoker"
fi

# Create key for local development
echo "Creating service account key for local development..."
gcloud iam service-accounts keys create credentials.json \
    --iam-account="$SA_EMAIL"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Set GOOGLE_APPLICATION_CREDENTIALS:"
echo "   export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/credentials.json"
echo ""
echo "2. Create .env file:"
echo "   cp .env.example .env"
echo "   # Edit .env with your project settings"
echo ""
echo "3. Install dependencies:"
echo "   npm install"
echo ""
echo "4. Start the services:"
echo "   npm run dev           # API server"
echo "   npm run start:scheduler   # Scheduler agent"
echo "   npm run start:negotiator  # Negotiator agent"
echo "   npm run start:capacity    # Capacity fabric"
echo "   npm run start:dashboard   # Dashboard"
echo ""
