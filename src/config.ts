/**
 * Configuration management for Xid-R.
 *
 * Loads settings from environment variables with sensible defaults for local development.
 */

import dotenv from "dotenv";

dotenv.config();

export interface GCPConfig {
  projectId: string;
  region: string;
  zone: string;
  gkeClusterName: string;
  gkeGpuNodePool: string;
  checkpointBucket: string;
  firestoreDatabase: string;
  credentialsPath: string | null;
}

export interface CapacityConfig {
  utilizationPollIntervalMs: number;
  idleThresholdPercent: number;
  harvestableIdleDurationMs: number;
  spotPreemptionGraceMs: number;
  mpsReclaimGraceMs: number;
  gpuHourlyRates: Record<string, number>;
}

export interface NegotiationConfig {
  negotiationTimeoutMs: number;
  checkpointTimeoutMs: number;
  maxNegotiationRetries: number;
  retryBackoffMs: number;
}

export interface APIConfig {
  host: string;
  port: number;
  debug: boolean;
  corsOrigins: string[];
}

export interface DashboardConfig {
  firebaseDatabaseUrl: string;
  updateIntervalMs: number;
  wsPort: number;
}

export interface GeminiConfig {
  apiKey: string | null;
  model: string;
  temperature: number;
}

export interface Config {
  environment: "development" | "staging" | "production";
  gcp: GCPConfig;
  capacity: CapacityConfig;
  negotiation: NegotiationConfig;
  api: APIConfig;
  dashboard: DashboardConfig;
  gemini: GeminiConfig;
  gainSharePercent: number;
}

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function getEnvFloat(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseFloat(value) : defaultValue;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  return value ? value.toLowerCase() === "true" : defaultValue;
}

export function createConfig(): Config {
  return {
    environment: getEnv("ENVIRONMENT", "development") as Config["environment"],

    gcp: {
      projectId: getEnv("GCP_PROJECT_ID", "xid-r-development"),
      region: getEnv("GCP_REGION", "us-central1"),
      zone: getEnv("GCP_ZONE", "us-central1-a"),
      gkeClusterName: getEnv("GKE_CLUSTER_NAME", "xidr-cluster"),
      gkeGpuNodePool: getEnv("GKE_GPU_NODE_POOL", "gpu-pool"),
      checkpointBucket: getEnv("CHECKPOINT_BUCKET", "xidr-checkpoints"),
      firestoreDatabase: getEnv("FIRESTORE_DATABASE", "(default)"),
      credentialsPath: getEnv("GOOGLE_APPLICATION_CREDENTIALS", "") || null,
    },

    capacity: {
      utilizationPollIntervalMs: getEnvNumber("UTILIZATION_POLL_INTERVAL_MS", 30000),
      idleThresholdPercent: getEnvFloat("IDLE_THRESHOLD_PERCENT", 15.0),
      harvestableIdleDurationMs: getEnvNumber("HARVESTABLE_IDLE_DURATION_MS", 300000),
      spotPreemptionGraceMs: 120000, // 120 seconds
      mpsReclaimGraceMs: 30000, // 30 seconds
      gpuHourlyRates: {
        "nvidia-t4": 0.35,
        "nvidia-l4": 0.7,
        "nvidia-a100-40gb": 2.93,
        "nvidia-a100-80gb": 3.67,
      },
    },

    negotiation: {
      negotiationTimeoutMs: getEnvNumber("NEGOTIATION_TIMEOUT_MS", 60000),
      checkpointTimeoutMs: getEnvNumber("CHECKPOINT_TIMEOUT_MS", 90000),
      maxNegotiationRetries: 2,
      retryBackoffMs: 1000,
    },

    api: {
      host: getEnv("API_HOST", "0.0.0.0"),
      port: getEnvNumber("API_PORT", 8080),
      debug: getEnvBool("DEBUG", false),
      corsOrigins: [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:8080",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:8080",
        "https://*.run.app",
        "https://xid-r.vercel.app",
      ],
    },

    dashboard: {
      firebaseDatabaseUrl: getEnv(
        "FIREBASE_DATABASE_URL",
        "https://xidr-demo-default-rtdb.firebaseio.com"
      ),
      updateIntervalMs: 1000,
      wsPort: getEnvNumber("DASHBOARD_WS_PORT", 8081),
    },

    gemini: {
      apiKey: getEnv("GOOGLE_API_KEY", "") || null,
      model: getEnv("GEMINI_MODEL", "gemini-1.5-flash"),
      temperature: getEnvFloat("GEMINI_TEMPERATURE", 0.7),
    },

    gainSharePercent: getEnvFloat("GAIN_SHARE_PERCENT", 15.0),
  };
}

// Global config singleton
let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    config = createConfig();
  }
  return config;
}

export function resetConfig(): void {
  config = null;
}
