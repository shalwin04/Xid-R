/**
 * Client for calling Xid-R MCP tools.
 *
 * Provides a typed interface for GPU requests, checkpoints, and releases.
 */
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
export class XidrClient {
    baseUrl;
    timeout;
    headers;
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/$/, "");
        this.timeout = options.timeout ?? 30000;
        this.headers = {
            "Content-Type": "application/json",
            ...options.headers,
        };
    }
    /**
     * Request GPU capacity.
     *
     * @param input - Request parameters
     * @returns Lease information (granted or queued)
     */
    async requestGpu(input) {
        return this.callTool("xidr_request_gpu", input);
    }
    /**
     * Acknowledge checkpoint completion.
     *
     * Call this after successfully writing checkpoint to GCS.
     *
     * @param input - Checkpoint details
     * @returns Acknowledgment with resume queue status
     */
    async checkpointAck(input) {
        return this.callTool("xidr_checkpoint_ack", input);
    }
    /**
     * Voluntarily release GPU capacity.
     *
     * @param input - Lease to release
     * @returns Billing summary with savings
     */
    async release(input) {
        return this.callTool("xidr_release", input);
    }
    /**
     * Get status of a lease or system overview.
     *
     * @param input - Optional lease ID (omit for system status)
     * @returns Lease details or system overview
     */
    async status(input = {}) {
        return this.callTool("xidr_status", input);
    }
    /**
     * Get explanation for a scheduling decision.
     *
     * @param leaseId - Lease to explain
     * @param eventType - Optional event type filter
     * @returns Human-readable explanation with timeline
     */
    async explain(leaseId, eventType) {
        return this.callTool("xidr_explain", {
            lease_id: leaseId,
            event_type: eventType,
        });
    }
    /**
     * Call an MCP tool endpoint.
     */
    async callTool(toolName, input) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await fetch(`${this.baseUrl}/mcp/tools/${toolName}`, {
                method: "POST",
                headers: this.headers,
                body: JSON.stringify(input),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                throw new XidrError(`MCP tool ${toolName} failed: ${errorData.error ?? response.statusText}`, response.status, errorData);
            }
            return await response.json();
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error.name === "AbortError") {
                throw new XidrError(`Request to ${toolName} timed out`, 408);
            }
            if (error instanceof XidrError) {
                throw error;
            }
            throw new XidrError(`Request to ${toolName} failed: ${error.message}`, 0);
        }
    }
    /**
     * Health check for Xid-R API.
     */
    async healthCheck() {
        const response = await fetch(`${this.baseUrl}/health`, {
            headers: this.headers,
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
            throw new XidrError("Health check failed", response.status);
        }
        return response.json();
    }
}
/**
 * Error from Xid-R API.
 */
export class XidrError extends Error {
    statusCode;
    details;
    constructor(message, statusCode, details) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.name = "XidrError";
    }
}
/**
 * Create a Xid-R client with default options for local development.
 */
export function createLocalClient() {
    return new XidrClient({
        baseUrl: process.env.XIDR_API_URL ?? "http://localhost:8080",
    });
}
/**
 * Create a Xid-R client for Cloud Run deployment.
 */
export function createCloudRunClient(serviceUrl) {
    return new XidrClient({
        baseUrl: serviceUrl,
        headers: {
        // Cloud Run handles authentication via IAM
        },
    });
}
//# sourceMappingURL=client.js.map