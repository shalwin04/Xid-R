/**
 * Client for calling Xid-R MCP tools.
 *
 * Provides a typed interface for GPU requests, checkpoints, and releases.
 */
import type { RequestGpuInput, RequestGpuResponse, CheckpointAckInput, CheckpointAckResponse, ReleaseInput, ReleaseResponse, StatusInput, StatusResponse } from "./types.js";
/**
 * Options for the Xid-R client.
 */
export interface XidrClientOptions {
    /** Base URL for Xid-R API (e.g., http://localhost:8080) */
    baseUrl: string;
    /** Timeout for requests in milliseconds */
    timeout?: number;
    /** Custom headers to include */
    headers?: Record<string, string>;
}
/**
 * Client for interacting with Xid-R GPU broker.
 *
 * @example
 * ```typescript
 * const client = new XidrClient({
 *   baseUrl: "http://localhost:8080",
 * });
 *
 * // Request a GPU
 * const lease = await client.requestGpu({
 *   gpu_type: "nvidia-t4",
 *   a2a_endpoint: "http://my-agent:8080",
 *   priority: "normal",
 * });
 *
 * // When preempted and checkpointed
 * await client.checkpointAck({
 *   lease_id: lease.lease_id,
 *   checkpoint_uri: "gs://bucket/checkpoint.json",
 *   size_bytes: 1024,
 * });
 *
 * // When done
 * await client.release({ lease_id: lease.lease_id });
 * ```
 */
export declare class XidrClient {
    private baseUrl;
    private timeout;
    private headers;
    constructor(options: XidrClientOptions);
    /**
     * Request GPU capacity.
     *
     * @param input - Request parameters
     * @returns Lease information (granted or queued)
     */
    requestGpu(input: RequestGpuInput): Promise<RequestGpuResponse>;
    /**
     * Acknowledge checkpoint completion.
     *
     * Call this after successfully writing checkpoint to GCS.
     *
     * @param input - Checkpoint details
     * @returns Acknowledgment with resume queue status
     */
    checkpointAck(input: CheckpointAckInput): Promise<CheckpointAckResponse>;
    /**
     * Voluntarily release GPU capacity.
     *
     * @param input - Lease to release
     * @returns Billing summary with savings
     */
    release(input: ReleaseInput): Promise<ReleaseResponse>;
    /**
     * Get status of a lease or system overview.
     *
     * @param input - Optional lease ID (omit for system status)
     * @returns Lease details or system overview
     */
    status(input?: StatusInput): Promise<StatusResponse>;
    /**
     * Get explanation for a scheduling decision.
     *
     * @param leaseId - Lease to explain
     * @param eventType - Optional event type filter
     * @returns Human-readable explanation with timeline
     */
    explain(leaseId: string, eventType?: "grant" | "deny" | "evict" | "resume"): Promise<{
        explanation: string;
        timeline: Array<{
            timestamp: string;
            event: string;
            details: string;
        }>;
        decision_factors: string[];
    }>;
    /**
     * Call an MCP tool endpoint.
     */
    private callTool;
    /**
     * Health check for Xid-R API.
     */
    healthCheck(): Promise<{
        status: string;
        version: string;
    }>;
}
/**
 * Error from Xid-R API.
 */
export declare class XidrError extends Error {
    statusCode: number;
    details?: unknown | undefined;
    constructor(message: string, statusCode: number, details?: unknown | undefined);
}
/**
 * Create a Xid-R client with default options for local development.
 */
export declare function createLocalClient(): XidrClient;
/**
 * Create a Xid-R client for Cloud Run deployment.
 */
export declare function createCloudRunClient(serviceUrl: string): XidrClient;
//# sourceMappingURL=client.d.ts.map