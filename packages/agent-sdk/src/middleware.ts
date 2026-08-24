/**
 * Hono middleware for handling A2A requests from Xid-R.
 *
 * This middleware sets up the /a2a/tasks endpoint that the Negotiator
 * calls when it needs to reclaim capacity.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import {
  ReclaimRequestSchema,
  ResumeNotificationSchema,
  A2ATaskSchema,
  type ReclaimRequest,
  type ReclaimResponse,
  type ResumeNotification,
  type A2ATaskResponse,
} from "./types.js";
import type { XidrCheckpointable, CheckpointManager, InMemoryCheckpointManager } from "./checkpoint.js";

/**
 * Handler for reclaim requests.
 */
export type ReclaimHandler = (
  request: ReclaimRequest,
  ctx: ReclaimContext
) => Promise<ReclaimResponse>;

/**
 * Handler for resume notifications.
 */
export type ResumeHandler = (
  notification: ResumeNotification,
  ctx: ResumeContext
) => Promise<void>;

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
export function createA2ARoutes(options: A2AMiddlewareOptions): Hono {
  const {
    agent,
    checkpointManager,
    agentType,
    onReclaim,
    onResume,
    logger = console.log,
  } = options;

  const app = new Hono();

  const log = (message: string, data?: Record<string, unknown>) => {
    logger(`[a2a:${agentType}] ${message}`, data);
  };

  // A2A tasks endpoint - handles reclaim requests
  app.post("/tasks", async (c: Context) => {
    try {
      const body = await c.req.json();

      // Validate A2A task wrapper
      const taskParsed = A2ATaskSchema.safeParse(body);
      if (!taskParsed.success) {
        return c.json<A2ATaskResponse>({
          status: "failed",
          error: "Invalid A2A task format",
        }, 400);
      }

      const { task_type, data } = taskParsed.data;

      // Handle different task types
      switch (task_type) {
        case "reclaim_request":
          return await handleReclaimRequest(c, data, {
            agent,
            checkpointManager,
            log,
            onReclaim,
            agentType,
          });

        case "resume_notification":
          return await handleResumeNotification(c, data, {
            agent,
            checkpointManager,
            log,
            onResume,
          });

        default:
          return c.json<A2ATaskResponse>({
            status: "failed",
            error: `Unknown task type: ${task_type}`,
          }, 400);
      }
    } catch (error) {
      log("Error handling A2A task", { error: (error as Error).message });
      return c.json<A2ATaskResponse>({
        status: "failed",
        error: (error as Error).message,
      }, 500);
    }
  });

  // Health check for A2A endpoint
  app.get("/health", (c: Context) => {
    return c.json({
      status: "ok",
      agent_type: agentType,
      checkpointable: true,
      state_estimate_bytes: agent.getStateEstimate(),
    });
  });

  return app;
}

/**
 * Handle a reclaim request from the Negotiator.
 */
async function handleReclaimRequest(
  c: Context,
  data: unknown,
  options: {
    agent: XidrCheckpointable;
    checkpointManager: CheckpointManager | InMemoryCheckpointManager;
    log: (message: string, data?: Record<string, unknown>) => void;
    onReclaim?: ReclaimHandler;
    agentType: string;
  }
): Promise<Response> {
  const { agent, checkpointManager, log, onReclaim, agentType } = options;

  // Validate reclaim request
  const parsed = ReclaimRequestSchema.safeParse(data);
  if (!parsed.success) {
    return c.json<A2ATaskResponse>({
      status: "failed",
      error: "Invalid reclaim request",
    }, 400);
  }

  const request = parsed.data;
  log("Received reclaim request", {
    lease_id: request.lease_id,
    reason: request.reason,
    grace_period_seconds: request.grace_period_seconds,
  });

  // If custom handler provided, use it
  if (onReclaim) {
    const response = await onReclaim(request, {
      agent,
      checkpointManager,
      log,
    });

    return c.json<A2ATaskResponse>({
      status: "completed",
      data: response,
    });
  }

  // Default behavior: checkpoint if available, otherwise accept loss
  const checkpointOption = request.options.find(o => o.action === "checkpoint");

  if (checkpointOption && checkpointOption.target) {
    // Estimate checkpoint time
    const stateSize = agent.getStateEstimate();
    const estimatedSeconds = Math.ceil(stateSize / (1024 * 1024) * 2); // ~2s per MB

    log("Choosing checkpoint action", {
      state_size_bytes: stateSize,
      estimated_seconds: estimatedSeconds,
    });

    const response: ReclaimResponse = {
      type: "reclaim_response",
      lease_id: request.lease_id,
      chosen_action: "checkpoint",
      estimated_duration_seconds: estimatedSeconds,
    };

    // Start checkpoint in background (non-blocking response)
    // The actual checkpoint will be confirmed via xidr_checkpoint_ack
    performCheckpoint(
      agent,
      checkpointManager,
      checkpointOption.target,
      request.lease_id,
      agentType,
      log
    ).catch(err => {
      log("Background checkpoint failed", { error: err.message });
    });

    return c.json<A2ATaskResponse>({
      status: "working",
      data: response,
    });
  }

  // No checkpoint option or no target - accept loss
  log("No checkpoint option available, accepting loss");

  const response: ReclaimResponse = {
    type: "reclaim_response",
    lease_id: request.lease_id,
    chosen_action: "accept_loss",
  };

  return c.json<A2ATaskResponse>({
    status: "completed",
    data: response,
  });
}

/**
 * Perform checkpoint operation.
 */
async function performCheckpoint(
  agent: XidrCheckpointable,
  checkpointManager: CheckpointManager | InMemoryCheckpointManager,
  targetUri: string,
  leaseId: string,
  agentType: string,
  log: (message: string, data?: Record<string, unknown>) => void
): Promise<void> {
  log("Starting checkpoint", { target_uri: targetUri });

  let result;
  if ("checkpoint" in checkpointManager && checkpointManager.checkpoint.length === 3) {
    // CheckpointManager (GCS)
    result = await (checkpointManager as CheckpointManager).checkpoint(agent, targetUri, leaseId);
  } else {
    // InMemoryCheckpointManager
    result = await (checkpointManager as InMemoryCheckpointManager).checkpoint(
      agent,
      targetUri,
      leaseId,
      agentType
    );
  }

  if (result.success) {
    log("Checkpoint completed", {
      uri: result.uri,
      size_bytes: result.size_bytes,
      duration_ms: result.duration_ms,
    });

    // Note: Agent should call xidr_checkpoint_ack after this
    // This is handled by the agent's main loop, not here
  } else {
    log("Checkpoint failed", { error: result.error });
    throw new Error(result.error ?? "Checkpoint failed");
  }
}

/**
 * Handle a resume notification from Xid-R.
 */
async function handleResumeNotification(
  c: Context,
  data: unknown,
  options: {
    agent: XidrCheckpointable;
    checkpointManager: CheckpointManager | InMemoryCheckpointManager;
    log: (message: string, data?: Record<string, unknown>) => void;
    onResume?: ResumeHandler;
  }
): Promise<Response> {
  const { agent, checkpointManager, log, onResume } = options;

  // Validate resume notification
  const parsed = ResumeNotificationSchema.safeParse(data);
  if (!parsed.success) {
    return c.json<A2ATaskResponse>({
      status: "failed",
      error: "Invalid resume notification",
    }, 400);
  }

  const notification = parsed.data;
  log("Received resume notification", {
    new_lease_id: notification.new_lease_id,
    checkpoint_uri: notification.checkpoint_uri,
  });

  // If custom handler provided, use it
  if (onResume) {
    await onResume(notification, {
      agent,
      checkpointManager,
      log,
    });

    return c.json<A2ATaskResponse>({
      status: "completed",
    });
  }

  // Default behavior: restore from checkpoint
  const result = await checkpointManager.restore(agent, notification.checkpoint_uri);

  if (result.success) {
    log("Restored from checkpoint", { checkpoint_uri: notification.checkpoint_uri });
    return c.json<A2ATaskResponse>({
      status: "completed",
    });
  }

  log("Failed to restore from checkpoint", { error: result.error });
  return c.json<A2ATaskResponse>({
    status: "failed",
    error: result.error,
  }, 500);
}
