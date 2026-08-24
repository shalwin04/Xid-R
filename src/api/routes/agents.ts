/**
 * Agent management routes.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  registerAgent,
  getAgentCard,
  getAllAgents,
  deleteAgentCard,
  touchAgent,
} from "../../db/agents.js";

export const agentRoutes = new Hono();

// Get all registered agents
agentRoutes.get("/", async (c) => {
  const agents = await getAllAgents();
  return c.json({ agents });
});

// Get agent by ID
agentRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const agent = await getAgentCard(id);

  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  return c.json({ agent });
});

// Register agent
const RegisterAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  a2a_endpoint: z.string().url(),
  supported_tasks: z.array(z.string()).optional(),
  checkpointable: z.boolean().optional(),
  estimated_checkpoint_size_bytes: z.number().optional(),
  trust_tier: z.enum(["internal", "external", "untrusted"]).optional(),
  owner_email: z.string().email().optional(),
});

agentRoutes.post("/register", zValidator("json", RegisterAgentSchema), async (c) => {
  const input = c.req.valid("json");

  const agent = await registerAgent({
    id: input.id,
    name: input.name,
    description: input.description,
    a2aEndpoint: input.a2a_endpoint,
    supportedTasks: input.supported_tasks,
    checkpointable: input.checkpointable,
    estimatedCheckpointSizeBytes: input.estimated_checkpoint_size_bytes,
    trustTier: input.trust_tier,
    ownerEmail: input.owner_email,
  });

  return c.json({ agent }, 201);
});

// Heartbeat (update last seen)
agentRoutes.post("/:id/heartbeat", async (c) => {
  const id = c.req.param("id");
  const agent = await getAgentCard(id);

  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  await touchAgent(id);
  return c.json({ acknowledged: true });
});

// Delete agent
agentRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await deleteAgentCard(id);
  return c.json({ deleted: true });
});
