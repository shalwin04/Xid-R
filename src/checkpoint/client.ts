/**
 * Xid-R Client - Simplified API for Tenant Agents
 *
 * Provides a high-level client for tenant agents to interact with the
 * Xid-R broker, including GPU capacity requests, checkpointing, and
 * preemption handling.
 *
 * Features:
 * - Simple initialization and connection
 * - GPU capacity request/release
 * - Automatic checkpoint handling
 * - Preemption event callbacks
 * - WebSocket for real-time notifications
 * - Health checks and reconnection
 * - Type-safe API responses
 */

import { EventEmitter } from "events";
import {
  CheckpointHelper,
  CheckpointConfig,
  CheckpointResult,
  RestoreResult,
  ProgressCallback,
} from "./sdk.js";
import type { CheckpointState } from "../models/checkpoint.js";
import { createEmptyCheckpointState } from "../models/checkpoint.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger({ module: "xidr-client" });

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * GPU types supported by Xid-R.
 */
export type GpuType = "nvidia-t4" | "nvidia-l4" | "nvidia-a100-40gb" | "nvidia-a100-80gb";

/**
 * Request priority levels.
 */
export type Priority = "low" | "normal" | "high";

/**
 * Lease status values.
 */
export type LeaseStatus =
  | "pending"
  | "active"
  | "negotiating"
  | "checkpointing"
  | "checkpointed"
  | "resuming"
  | "completed"
  | "lost";

/**
 * Client configuration.
 */
export interface XidrClientConfig {
  /** Xid-R API base URL (default: http://localhost:3001) */
  apiBaseUrl: string;
  /** Unique agent ID */
  agentId: string;
  /** Human-readable agent name */
  agentName?: string;
  /** Agent type for checkpoint state */
  agentType: string;
  /** A2A endpoint for receiving negotiation callbacks */
  a2aEndpoint: string;
  /** Whether agent supports checkpointing (default: true) */
  checkpointable?: boolean;
  /** Checkpoint configuration */
  checkpointConfig?: Partial<CheckpointConfig>;
  /** Request timeout in ms (default: 30000) */
  requestTimeoutMs?: number;
  /** Enable auto-reconnect for WebSocket (default: true) */
  autoReconnect?: boolean;
  /** Reconnect delay in ms (default: 5000) */
  reconnectDelayMs?: number;
  /** Max reconnect attempts (default: 10) */
  maxReconnectAttempts?: number;
}

/**
 * Connection info returned when GPU is granted.
 */
export interface ConnectionInfo {
  host: string;
  port: number;
  gpuDevice: string;
}

/**
 * GPU request options.
 */
export interface GpuRequestOptions {
  gpuType: GpuType;
  durationHintSeconds?: number;
  priority?: Priority;
}

/**
 * GPU request result.
 */
export interface GpuRequestResult {
  leaseId: string;
  status: "granted" | "queued";
  capacityUnitId?: string;
  connectionInfo?: ConnectionInfo;
  preemptionWarningSeconds?: number;
  checkpointTargetUri?: string;
  queuePosition?: number;
  message?: string;
}

/**
 * Lease status result.
 */
export interface LeaseStatusResult {
  id: string;
  status: LeaseStatus;
  gpuType: GpuType;
  capacityUnitId?: string;
  capacityLane?: string;
  grantedAt?: string;
  checkpointUri?: string;
  preemptionWarningSeconds?: number;
}

/**
 * System status result.
 */
export interface SystemStatusResult {
  activeLeases: number;
  pendingRequests: number;
  completedLeases: number;
  totalSavingsUsd: number;
  availableCapacity: Record<GpuType, number>;
  capacitySummary: {
    total: number;
    available: number;
    leased: number;
  };
}

/**
 * Release result.
 */
export interface ReleaseResult {
  released: boolean;
  billableSeconds: number;
  baselineCostUsd: number;
  actualCostUsd: number;
  savingsUsd: number;
}

/**
 * Checkpoint acknowledgment result.
 */
export interface CheckpointAckResult {
  acknowledged: boolean;
  checkpointId: string;
  resumeQueued: boolean;
  estimatedResumeWaitSeconds: number;
}

/**
 * Explanation result.
 */
export interface ExplanationResult {
  leaseId: string;
  leaseStatus: LeaseStatus;
  explanation: string;
  timeline: Array<{
    timestamp: string;
    event: string;
    details: string;
  }>;
  decisionFactors: string[];
}

/**
 * Preemption event data.
 */
export interface PreemptionEvent {
  leaseId: string;
  graceSeconds: number;
  reason: string;
  checkpointTargetUri: string;
  options: Array<"checkpoint" | "migrate" | "accept_loss">;
}

/**
 * Events emitted by XidrClient.
 */
export interface XidrClientEvents {
  connected: () => void;
  disconnected: (reason: string) => void;
  preemption: (event: PreemptionEvent) => void;
  leaseGranted: (leaseId: string, connectionInfo: ConnectionInfo) => void;
  error: (error: Error) => void;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Partial<XidrClientConfig> = {
  apiBaseUrl: "http://localhost:3001",
  checkpointable: true,
  requestTimeoutMs: 30000,
  autoReconnect: true,
  reconnectDelayMs: 5000,
  maxReconnectAttempts: 10,
};

// ============================================================================
// XidrClient Class
// ============================================================================

/**
 * High-level client for tenant agents to interact with Xid-R.
 *
 * @example
 * ```typescript
 * const client = createXidrClient({
 *   agentId: "my-research-agent",
 *   agentType: "research",
 *   a2aEndpoint: "https://my-agent.run.app/a2a",
 * });
 *
 * // Request GPU
 * const result = await client.requestGpu({ gpuType: "nvidia-t4" });
 *
 * // Handle preemption
 * client.on("preemption", async (event) => {
 *   await client.checkpoint(event.checkpointTargetUri);
 * });
 *
 * // Release when done
 * await client.release();
 * ```
 */
export class XidrClient extends EventEmitter {
  private config: Required<XidrClientConfig>;
  private checkpointHelper: CheckpointHelper;
  private state: CheckpointState;
  private currentLeaseId: string | null = null;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private connected = false;

  constructor(config: XidrClientConfig) {
    super();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      agentName: config.agentName ?? config.agentId,
      checkpointable: config.checkpointable ?? true,
      checkpointConfig: config.checkpointConfig ?? {},
      requestTimeoutMs: config.requestTimeoutMs ?? 30000,
      autoReconnect: config.autoReconnect ?? true,
      reconnectDelayMs: config.reconnectDelayMs ?? 5000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
    } as Required<XidrClientConfig>;

    this.checkpointHelper = new CheckpointHelper(
      config.agentType,
      config.checkpointConfig
    );
    this.state = createEmptyCheckpointState(config.agentType);
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Connect to Xid-R for real-time notifications.
   */
  async connect(): Promise<void> {
    if (this.connected) {
      log.debug("Already connected");
      return;
    }

    try {
      // Health check first
      const health = await this.healthCheck();
      if (!health.healthy) {
        throw new Error(`Xid-R is not healthy: ${health.error}`);
      }

      // Connect WebSocket for real-time events
      await this.connectWebSocket();

      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit("connected");

      log.info("Connected to Xid-R", { agentId: this.config.agentId });
    } catch (error) {
      log.error("Failed to connect", { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Disconnect from Xid-R.
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.emit("disconnected", "manual");
    log.info("Disconnected from Xid-R");
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  private async connectWebSocket(): Promise<void> {
    // WebSocket connection for real-time notifications
    // In a browser environment, use native WebSocket
    // In Node.js, use ws library
    const wsUrl = this.config.apiBaseUrl
      .replace("http://", "ws://")
      .replace("https://", "wss://") + "/ws/agent";

    return new Promise((resolve, reject) => {
      try {
        // Check if we're in a browser or Node.js
        const WebSocketImpl =
          typeof WebSocket !== "undefined"
            ? WebSocket
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            : require("ws");

        const ws = new WebSocketImpl(`${wsUrl}?agentId=${this.config.agentId}`);
        this.ws = ws;

        ws.onopen = () => {
          log.debug("WebSocket connected");
          resolve();
        };

        ws.onmessage = (event: { data: string }) => {
          this.handleWebSocketMessage(event.data);
        };

        ws.onclose = () => {
          this.handleWebSocketClose();
        };

        ws.onerror = (error: Error | Event) => {
          log.error("WebSocket error", { error: String(error) });
          // Don't reject on error, let onclose handle reconnection
        };

        // Timeout for connection
        setTimeout(() => {
          if (!this.connected) {
            reject(new Error("WebSocket connection timeout"));
          }
        }, this.config.requestTimeoutMs);
      } catch {
        // WebSocket not available (Node.js without ws package)
        log.warn("WebSocket not available, polling mode only");
        resolve();
      }
    });
  }

  private handleWebSocketMessage(rawData: string): void {
    try {
      const message = JSON.parse(rawData) as {
        type: string;
        data?: {
          leaseId?: string;
          connectionInfo?: ConnectionInfo;
          message?: string;
        } & Partial<PreemptionEvent>;
      };

      switch (message.type) {
        case "preemption":
          if (message.data) {
            this.emit("preemption", message.data as PreemptionEvent);
          }
          break;

        case "lease_granted":
          if (message.data?.leaseId && message.data?.connectionInfo) {
            this.emit("leaseGranted", message.data.leaseId, message.data.connectionInfo);
          }
          break;

        case "error":
          if (message.data?.message) {
            this.emit("error", new Error(message.data.message));
          }
          break;

        default:
          log.debug("Unknown message type", { type: message.type });
      }
    } catch (error) {
      log.error("Failed to parse WebSocket message", { error: (error as Error).message });
    }
  }

  private handleWebSocketClose(): void {
    this.connected = false;
    this.emit("disconnected", "connection_lost");

    if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      log.info("Reconnecting...", { attempt: this.reconnectAttempts });

      setTimeout(() => {
        this.connect().catch((error) => {
          log.error("Reconnection failed", { error: (error as Error).message });
        });
      }, this.config.reconnectDelayMs);
    }
  }

  // ==========================================================================
  // GPU Operations
  // ==========================================================================

  /**
   * Request GPU capacity.
   */
  async requestGpu(options: GpuRequestOptions): Promise<GpuRequestResult> {
    const body = {
      gpu_type: options.gpuType,
      duration_hint_seconds: options.durationHintSeconds ?? 3600,
      priority: options.priority ?? "normal",
      a2a_endpoint: this.config.a2aEndpoint,
      checkpointable: this.config.checkpointable,
      agent_id: this.config.agentId,
      agent_name: this.config.agentName,
    };

    const response = await this.apiRequest<{
      lease_id: string;
      status: "granted" | "queued";
      capacity_unit_id?: string;
      connection_info?: {
        host: string;
        port: number;
        gpu_device: string;
      };
      preemption_warning_seconds?: number;
      checkpoint_target_uri?: string;
      queue_position?: number;
      message?: string;
    }>("/mcp/tools/xidr_request_gpu", body);

    this.currentLeaseId = response.lease_id;

    const result: GpuRequestResult = {
      leaseId: response.lease_id,
      status: response.status,
      capacityUnitId: response.capacity_unit_id,
      preemptionWarningSeconds: response.preemption_warning_seconds,
      checkpointTargetUri: response.checkpoint_target_uri,
      queuePosition: response.queue_position,
      message: response.message,
    };

    if (response.connection_info) {
      result.connectionInfo = {
        host: response.connection_info.host,
        port: response.connection_info.port,
        gpuDevice: response.connection_info.gpu_device,
      };
    }

    log.info("GPU requested", { leaseId: response.lease_id, status: response.status });

    return result;
  }

  /**
   * Release current GPU capacity.
   */
  async release(leaseId?: string): Promise<ReleaseResult> {
    const id = leaseId ?? this.currentLeaseId;
    if (!id) {
      throw new Error("No active lease to release");
    }

    const response = await this.apiRequest<{
      released: boolean;
      billable_seconds: number;
      baseline_cost_usd: number;
      actual_cost_usd: number;
      savings_usd: number;
    }>("/mcp/tools/xidr_release", { lease_id: id });

    if (id === this.currentLeaseId) {
      this.currentLeaseId = null;
    }

    log.info("GPU released", { leaseId: id, savingsUsd: response.savings_usd });

    return {
      released: response.released,
      billableSeconds: response.billable_seconds,
      baselineCostUsd: response.baseline_cost_usd,
      actualCostUsd: response.actual_cost_usd,
      savingsUsd: response.savings_usd,
    };
  }

  // ==========================================================================
  // Checkpoint Operations
  // ==========================================================================

  /**
   * Checkpoint current state to GCS and acknowledge to Xid-R.
   */
  async checkpoint(
    targetUri?: string,
    onProgress?: ProgressCallback
  ): Promise<CheckpointResult> {
    if (!this.currentLeaseId) {
      throw new Error("No active lease for checkpointing");
    }

    // Update state timestamp
    this.state.createdAt = new Date().toISOString();

    // Upload to GCS
    const uploadResult = await this.checkpointHelper.uploadCheckpoint(
      targetUri ?? `gs://xidr-checkpoints/${this.currentLeaseId}/state.json`,
      this.state,
      onProgress
    );

    if (!uploadResult.success) {
      return uploadResult;
    }

    // Acknowledge to Xid-R
    try {
      await this.apiRequest<CheckpointAckResult>("/mcp/tools/xidr_checkpoint_ack", {
        lease_id: this.currentLeaseId,
        checkpoint_uri: uploadResult.uri,
        size_bytes: uploadResult.sizeBytes,
        duration_ms: uploadResult.durationMs,
      });

      log.info("Checkpoint completed", {
        leaseId: this.currentLeaseId,
        uri: uploadResult.uri,
        sizeBytes: uploadResult.sizeBytes,
      });
    } catch (error) {
      log.error("Failed to acknowledge checkpoint", { error: (error as Error).message });
      // Still return successful upload result
    }

    return uploadResult;
  }

  /**
   * Restore state from a checkpoint.
   */
  async restore(
    sourceUri: string,
    onProgress?: ProgressCallback
  ): Promise<RestoreResult> {
    const result = await this.checkpointHelper.downloadCheckpoint(sourceUri, onProgress);

    if (result.success && result.state) {
      this.state = result.state;
      log.info("State restored", { uri: sourceUri });
    }

    return result;
  }

  // ==========================================================================
  // Status & Info
  // ==========================================================================

  /**
   * Get status of current lease.
   */
  async getLeaseStatus(leaseId?: string): Promise<LeaseStatusResult> {
    const id = leaseId ?? this.currentLeaseId;
    if (!id) {
      throw new Error("No lease ID specified");
    }

    const response = await this.apiRequest<{
      lease: {
        id: string;
        status: LeaseStatus;
        gpu_type: GpuType;
        capacity_unit_id?: string;
        capacity_lane?: string;
        granted_at?: string;
        checkpoint_uri?: string;
        preemption_warning_seconds?: number;
      };
    }>("/mcp/tools/xidr_status", { lease_id: id });

    return {
      id: response.lease.id,
      status: response.lease.status,
      gpuType: response.lease.gpu_type,
      capacityUnitId: response.lease.capacity_unit_id,
      capacityLane: response.lease.capacity_lane,
      grantedAt: response.lease.granted_at,
      checkpointUri: response.lease.checkpoint_uri,
      preemptionWarningSeconds: response.lease.preemption_warning_seconds,
    };
  }

  /**
   * Get system status.
   */
  async getSystemStatus(): Promise<SystemStatusResult> {
    const response = await this.apiRequest<{
      system: {
        active_leases: number;
        pending_requests: number;
        completed_leases: number;
        total_savings_usd: number;
        available_capacity: Record<GpuType, number>;
        capacity_summary: {
          total: number;
          available: number;
          leased: number;
        };
      };
    }>("/mcp/tools/xidr_status", {});

    return {
      activeLeases: response.system.active_leases,
      pendingRequests: response.system.pending_requests,
      completedLeases: response.system.completed_leases,
      totalSavingsUsd: response.system.total_savings_usd,
      availableCapacity: response.system.available_capacity,
      capacitySummary: response.system.capacity_summary,
    };
  }

  /**
   * Get explanation for lease decisions.
   */
  async explain(
    leaseId?: string,
    eventType?: "grant" | "deny" | "evict" | "resume"
  ): Promise<ExplanationResult> {
    const id = leaseId ?? this.currentLeaseId;
    if (!id) {
      throw new Error("No lease ID specified");
    }

    const response = await this.apiRequest<{
      lease_id: string;
      lease_status: LeaseStatus;
      explanation: string;
      timeline: Array<{
        timestamp: string;
        event: string;
        details: string;
      }>;
      decision_factors: string[];
    }>("/mcp/tools/xidr_explain", {
      lease_id: id,
      event_type: eventType,
    });

    return {
      leaseId: response.lease_id,
      leaseStatus: response.lease_status,
      explanation: response.explanation,
      timeline: response.timeline,
      decisionFactors: response.decision_factors,
    };
  }

  /**
   * Health check the Xid-R service.
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return { healthy: false, error: `HTTP ${response.status}` };
      }

      const data = (await response.json()) as { status?: string };
      return { healthy: data.status === "healthy" || data.status === "ok" };
    } catch (error) {
      return { healthy: false, error: (error as Error).message };
    }
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Get current checkpoint state.
   */
  getState(): CheckpointState {
    return { ...this.state };
  }

  /**
   * Update checkpoint state.
   */
  setState(state: Partial<CheckpointState>): void {
    this.state = { ...this.state, ...state };
  }

  /**
   * Get current lease ID.
   */
  getCurrentLeaseId(): string | null {
    return this.currentLeaseId;
  }

  /**
   * Add task to queue.
   */
  addTask(task: CheckpointState["taskQueue"][0]): void {
    this.state.taskQueue.push(task);
  }

  /**
   * Update task status.
   */
  updateTaskStatus(taskId: string, status: string): void {
    const task = this.state.taskQueue.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
    }
  }

  /**
   * Set scratchpad value.
   */
  setScratchpadValue(key: string, value: unknown): void {
    this.state.scratchpad[key] = value;
  }

  /**
   * Get scratchpad value.
   */
  getScratchpadValue<T>(key: string): T | undefined {
    return this.state.scratchpad[key] as T | undefined;
  }

  /**
   * Add conversation entry.
   */
  addConversation(role: string, content: string): void {
    this.state.conversationHistory.push({ role, content });
  }

  /**
   * Increment API call count.
   */
  incrementApiCalls(): void {
    this.state.metadata.totalApiCalls++;
  }

  /**
   * Add tokens used.
   */
  addTokensUsed(tokens: number): void {
    this.state.metadata.tokensUsed += tokens;
  }

  /**
   * Estimate checkpoint size.
   */
  estimateCheckpointSize(): number {
    return this.checkpointHelper.estimateSize(this.state);
  }

  // ==========================================================================
  // Internal Helpers
  // ==========================================================================

  private async apiRequest<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.config.apiBaseUrl}${endpoint}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({ error: "Unknown error" }))) as {
        error?: string;
      };
      throw new Error(errorData.error ?? `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  // Type-safe event emitter methods
  on<K extends keyof XidrClientEvents>(event: K, listener: XidrClientEvents[K]): this {
    return super.on(event, listener);
  }

  emit<K extends keyof XidrClientEvents>(
    event: K,
    ...args: Parameters<XidrClientEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new XidrClient instance.
 *
 * @example
 * ```typescript
 * const client = createXidrClient({
 *   agentId: "research-agent-001",
 *   agentType: "research",
 *   a2aEndpoint: "https://my-agent.run.app/a2a",
 * });
 *
 * await client.connect();
 *
 * const result = await client.requestGpu({
 *   gpuType: "nvidia-t4",
 *   priority: "normal",
 * });
 *
 * if (result.status === "granted") {
 *   // Use GPU...
 *   await client.release();
 * }
 * ```
 */
export function createXidrClient(config: XidrClientConfig): XidrClient {
  return new XidrClient(config);
}

// All types are exported inline above
