/**
 * Install routes - Serve Kubernetes manifests for agent installation.
 */

import { Hono } from "hono";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const install = new Hono();

/**
 * GET /install/agent.yaml
 * Serve the consolidated agent manifest for kubectl installation
 */
install.get("/agent.yaml", async (c) => {
  try {
    // Try multiple paths to find the manifest
    const possiblePaths = [
      join(__dirname, "../../../k8s/agent.yaml"),
      join(process.cwd(), "k8s/agent.yaml"),
      "/app/k8s/agent.yaml", // Docker path
    ];

    let manifestContent: string | null = null;
    for (const manifestPath of possiblePaths) {
      if (existsSync(manifestPath)) {
        manifestContent = readFileSync(manifestPath, "utf-8");
        break;
      }
    }

    if (!manifestContent) {
      // Return inline manifest if file not found
      manifestContent = getInlineAgentManifest();
    }

    c.header("Content-Type", "text/yaml");
    c.header("Content-Disposition", 'attachment; filename="agent.yaml"');
    return c.body(manifestContent);
  } catch (error) {
    console.error("Failed to serve agent manifest:", error);
    return c.json({ error: "Failed to serve manifest" }, 500);
  }
});

/**
 * GET /install/helm-values.yaml
 * Serve sample Helm values file
 */
install.get("/helm-values.yaml", async (c) => {
  const valuesContent = `# Xid-R Agent Helm Values
# Configure these values for your environment

# Required: Your organization and cluster identifiers
organizationId: ""
clusterId: ""

# API configuration
apiEndpoint: "https://api.xidr.dev"
apiToken: ""

# Image configuration
image:
  repository: gcr.io/xidr-prod/xidr-agent
  tag: "latest"
  pullPolicy: Always

# Resource limits
resources:
  requests:
    cpu: "100m"
    memory: "256Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"

# Agent configuration
config:
  logLevel: "info"
  gpuIdleThresholdPercent: 10
  gpuIdleDurationSeconds: 300
  enableMpsSharing: true
`;

  c.header("Content-Type", "text/yaml");
  c.header("Content-Disposition", 'attachment; filename="values.yaml"');
  return c.body(valuesContent);
});

/**
 * GET /install/info
 * Get installation information
 */
install.get("/info", async (c) => {
  return c.json({
    version: "0.1.0",
    methods: {
      kubectl: {
        description: "Install using kubectl",
        command: "kubectl apply -f https://api.xidr.dev/install/agent.yaml",
        steps: [
          "Apply the manifest",
          "Create secret with credentials",
          "Restart the deployment",
        ],
      },
      helm: {
        description: "Install using Helm",
        repository: "https://charts.xidr.dev",
        chart: "xidr/xidr-agent",
        command:
          "helm install xidr-agent xidr/xidr-agent --namespace xidr-system --create-namespace",
      },
    },
    requirements: {
      kubernetes: ">=1.25",
      gpu: "NVIDIA GPU with drivers installed",
      permissions: "cluster-admin or equivalent RBAC",
    },
    documentation: "https://docs.xidr.dev/installation",
  });
});

/**
 * Inline agent manifest for fallback
 */
function getInlineAgentManifest(): string {
  return `# Xid-R Agent - Single-file installation manifest
# Generated for easy kubectl apply installation
---
apiVersion: v1
kind: Namespace
metadata:
  name: xidr-system
  labels:
    app.kubernetes.io/name: xidr
    app.kubernetes.io/component: agent
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: xidr-agent
  namespace: xidr-system
  labels:
    app.kubernetes.io/name: xidr
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: xidr-agent
rules:
  - apiGroups: [""]
    resources: ["nodes", "nodes/status"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: [""]
    resources: ["pods/status", "pods/exec", "pods/log"]
    verbs: ["get", "create", "update", "patch"]
  - apiGroups: [""]
    resources: ["events"]
    verbs: ["get", "list", "watch", "create", "patch"]
  - apiGroups: [""]
    resources: ["configmaps", "secrets", "namespaces"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments", "statefulsets", "replicasets", "daemonsets"]
    verbs: ["get", "list", "watch", "update", "patch"]
  - apiGroups: ["batch"]
    resources: ["jobs", "cronjobs"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["metrics.k8s.io"]
    resources: ["nodes", "pods"]
    verbs: ["get", "list"]
  - apiGroups: ["nvidia.com"]
    resources: ["*"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: xidr-agent
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: xidr-agent
subjects:
  - kind: ServiceAccount
    name: xidr-agent
    namespace: xidr-system
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: xidr-agent-config
  namespace: xidr-system
data:
  XIDR_API_ENDPOINT: "https://api.xidr.dev"
  UTILIZATION_POLL_INTERVAL: "30"
  HEARTBEAT_INTERVAL: "60"
  GPU_IDLE_THRESHOLD_PERCENT: "10"
  GPU_IDLE_DURATION_SECONDS: "300"
  LOG_LEVEL: "info"
  ENABLE_METRICS_EXPORT: "true"
  A2A_SERVER_PORT: "8080"
  GRACEFUL_SHUTDOWN_SECONDS: "120"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: xidr-agent
  namespace: xidr-system
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app.kubernetes.io/name: xidr
      app.kubernetes.io/component: agent
  template:
    metadata:
      labels:
        app.kubernetes.io/name: xidr
        app.kubernetes.io/component: agent
    spec:
      serviceAccountName: xidr-agent
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      tolerations:
        - key: nvidia.com/gpu
          operator: Exists
          effect: NoSchedule
      containers:
        - name: agent
          image: gcr.io/xidr-prod/xidr-agent:latest
          imagePullPolicy: Always
          ports:
            - name: a2a
              containerPort: 8080
            - name: metrics
              containerPort: 9090
            - name: health
              containerPort: 8081
          envFrom:
            - configMapRef:
                name: xidr-agent-config
            - secretRef:
                name: xidr-agent-secrets
          env:
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: POD_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
            - name: NODE_NAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
          resources:
            requests:
              cpu: "100m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          livenessProbe:
            httpGet:
              path: /healthz
              port: health
            initialDelaySeconds: 30
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /readyz
              port: health
            initialDelaySeconds: 10
            periodSeconds: 10
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: cache
              mountPath: /var/cache/xidr
      volumes:
        - name: tmp
          emptyDir: {}
        - name: cache
          emptyDir:
            sizeLimit: 100Mi
      terminationGracePeriodSeconds: 300
---
apiVersion: v1
kind: Service
metadata:
  name: xidr-agent
  namespace: xidr-system
spec:
  type: ClusterIP
  ports:
    - name: a2a
      port: 8080
      targetPort: a2a
    - name: metrics
      port: 9090
      targetPort: metrics
  selector:
    app.kubernetes.io/name: xidr
    app.kubernetes.io/component: agent
`;
}

export default install;
