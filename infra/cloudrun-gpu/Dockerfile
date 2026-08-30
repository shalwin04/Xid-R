# Cloud Run GPU Worker for Xid-R
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04

# Install Python and dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages (flask, gunicorn, requests from PyPI)
RUN pip3 install --no-cache-dir flask gunicorn requests

# Install PyTorch with CUDA support
RUN pip3 install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cu121

WORKDIR /app
COPY worker.py .

ENV PORT=8080
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 worker:app
