/**
 * @xidr/agent-sdk
 *
 * SDK for tenant agents to integrate with Xid-R GPU broker.
 *
 * @example
 * ```typescript
 * import { Hono } from "hono";
 * import {
 *   XidrClient,
 *   createA2ARoutes,
 *   CheckpointManager,
 *   XidrCheckpointable,
 * } from "@xidr/agent-sdk";
 *
 * // 1. Implement checkpointable interface
 * class MyAgent implements XidrCheckpointable {
 *   private state = { tasks: [], progress: 0 };
 *
 *   async getCheckpointState() { return this.state; }
 *   async restoreFromCheckpoint(state) { this.state = state; }
 *   getStateEstimate() { return JSON.stringify(this.state).length; }
 * }
 *
 * // 2. Set up Hono app with A2A routes
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
 * // 3. Use client to interact with Xid-R
 * const client = new XidrClient({ baseUrl: "http://localhost:8080" });
 *
 * const lease = await client.requestGpu({
 *   gpu_type: "nvidia-t4",
 *   a2a_endpoint: "http://my-agent:8080",
 * });
 *
 * // ... do work ...
 *
 * await client.release({ lease_id: lease.lease_id });
 * ```
 *
 * @packageDocumentation
 */

// Types
export * from "./types.js";

// Checkpoint
export {
  type XidrCheckpointable,
  type CheckpointOptions,
  CheckpointManager,
  InMemoryCheckpointManager,
} from "./checkpoint.js";

// Middleware
export {
  createA2ARoutes,
  type A2AMiddlewareOptions,
  type ReclaimHandler,
  type ResumeHandler,
  type ReclaimContext,
  type ResumeContext,
} from "./middleware.js";

// Client
export {
  XidrClient,
  XidrError,
  createLocalClient,
  createCloudRunClient,
  type XidrClientOptions,
} from "./client.js";
