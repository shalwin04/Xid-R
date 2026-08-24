/**
 * Xid-R - Agentic GPU Compute Broker
 *
 * Harvests idle GPU capacity and brokers it to AI agents using MCP tools
 * and A2A negotiation for checkpoint/resume orchestration.
 */

export * from "./config.js";
export * from "./models/index.js";
export * from "./db/index.js";
export * from "./utils/index.js";

// Agents
export { SchedulerAgent } from "./agents/scheduler.js";
export { NegotiatorAgent, getNegotiator } from "./agents/negotiator.js";

// Capacity
export { CapacityFabric, getCapacityFabric } from "./capacity/fabric.js";
export { PreemptionHandler, getPreemptionHandler } from "./capacity/preemption.js";

// Checkpoint SDK
export {
  CheckpointHelper,
  CheckpointableAgent,
  MockCheckpointHelper,
  type XidrCheckpointable,
  type CheckpointResult,
  type RestoreResult,
} from "./checkpoint/sdk.js";

// API
export { createApp, startServer } from "./api/server.js";

// Dashboard
export { DashboardServer } from "./dashboard/server.js";

// Version
export const VERSION = "0.1.0";
