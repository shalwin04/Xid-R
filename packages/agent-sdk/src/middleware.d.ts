/**
 * Hono middleware for handling A2A requests from Xid-R.
 *
 * This middleware sets up the /a2a/tasks endpoint that the Negotiator
 * calls when it needs to reclaim capacity.
 */
import { Hono } from "hono";
import { type ReclaimRequest, type ReclaimResponse, type ResumeNotification } from "./types.js";
import type { XidrCheckpointable, CheckpointManager, InMemoryCheckpointManager } from "./checkpoint.js";
/**
 * Handler for reclaim requests.
 */
export type ReclaimHandler = (request: ReclaimRequest, ctx: ReclaimContext) => Promise<ReclaimResponse>;
/**
 * Handler for resume notifications.
 */
export type ResumeHandler = (notification: ResumeNotification, ctx: ResumeContext) => Promise<void>;
/**
 * Context provided to reclaim handlers.
 */
export interface ReclaimContext {
    /** The agent being reclaimed */
    agent: XidrCheckpointable;
    /** Checkpoint manager for saving state */
    checkpointManager: CheckpointManager | InMemoryCheckpointManager;
    /** Logger function */
    log: (message: string, data?: Record<string, unknown>) => void;
}
/**
 * Context provided to resume handlers.
 */
export interface ResumeContext {
    /** The agent to resume */
    agent: XidrCheckpointable;
    /** Checkpoint manager for restoring state */
    checkpointManager: CheckpointManager | InMemoryCheckpointManager;
    /** Logger function */
    log: (message: string, data?: Record<string, unknown>) => void;
}
/**
 * Options for the A2A middleware.
 */
export interface A2AMiddlewareOptions {
    /** The checkpointable agent */
    agent: XidrCheckpointable;
    /** Checkpoint manager */
    checkpointManager: CheckpointManager | InMemoryCheckpointManager;
    /** Agent type identifier */
    agentType: string;
    /** Custom reclaim handler (optional - default handles checkpoint) */
    onReclaim?: ReclaimHandler;
    /** Custom resume handler (optional) */
    onResume?: ResumeHandler;
    /** Logger function */
    logger?: (message: string, data?: Record<string, unknown>) => void;
}
/**
 * Create Hono routes for A2A protocol.
 *
 * @example
 * ```typescript
 * import { Hono } from "hono";
 * import { createA2ARoutes, CheckpointManager } from "@xidr/agent-sdk";
 *
 * const app = new Hono();
 * const agent = new MyAgent();
 * const checkpointManager = new CheckpointManager({ agentType: "my-agent" });
 *
 * app.route("/a2a", createA2ARoutes({
 *   agent,
 *   checkpointManager,
 *   agentType: "my-agent",
 * }));
 *
 * // Now POST /a2a/tasks will handle reclaim requests
 * ```
 */
export declare function createA2ARoutes(options: A2AMiddlewareOptions): Hono;
//# sourceMappingURL=middleware.d.ts.map