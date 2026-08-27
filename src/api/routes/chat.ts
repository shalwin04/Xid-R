/**
 * Chat API Routes - LLM-Powered Assistant
 *
 * Provides a conversational interface to interact with Xid-R.
 * This is powered by Gemini and demonstrates true agentic behavior.
 */

import { Hono } from "hono";
import { z } from "zod";

import { getChatbot, type ChatResponse } from "../../agents/llm/chatbot.js";
import { getLease } from "../../db/leases.js";
import { getAuditEventsForLease, getRecentAuditEvents } from "../../db/audit.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger({ module: "chat-api" });

export const chatRoutes = new Hono();

// Chat message schema
const ChatMessageSchema = z.object({
  message: z.string().min(1).max(2000),
  session_id: z.string().optional(),
});

/**
 * Send a chat message to the AI assistant
 */
chatRoutes.post("/message", async (c) => {
  const body = await c.req.json();
  const parsed = ChatMessageSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.errors }, 400);
  }

  const { message } = parsed.data;

  try {
    const chatbot = getChatbot();
    const response: ChatResponse = await chatbot.chat(message);

    return c.json({
      success: true,
      response: response.text,
      function_calls: response.functionResults?.map((f) => f.name),
    });
  } catch (error) {
    log.error("Chat error", { error: (error as Error).message });
    return c.json({ error: "Chat failed", details: (error as Error).message }, 500);
  }
});

/**
 * Clear chat history and start fresh
 */
chatRoutes.post("/clear", (c) => {
  const chatbot = getChatbot();
  chatbot.clearHistory();
  return c.json({ success: true, message: "Chat history cleared" });
});

/**
 * Get chat history
 */
chatRoutes.get("/history", (c) => {
  const chatbot = getChatbot();
  const history = chatbot.getHistory();
  return c.json({ history });
});

// === Explain Routes (Read-Only) ===

const ExplainLeaseSchema = z.object({
  lease_id: z.string(),
});

/**
 * Explain decisions for a specific lease (read-only)
 */
chatRoutes.get("/explain/lease/:leaseId", async (c) => {
  const leaseId = c.req.param("leaseId");

  const [lease, events] = await Promise.all([
    getLease(leaseId),
    getAuditEventsForLease(leaseId),
  ]);

  if (!lease) {
    return c.json({ error: "Lease not found", lease_id: leaseId }, 404);
  }

  // Build explanation from audit trail
  const timeline = events.map((e) => ({
    timestamp: e.timestamp.toISOString(),
    event: e.eventType,
    reasoning: e.reasoning || e.eventType.replace(/_/g, " "),
    factors: e.decisionFactors || [],
    source: e.source,
    llm_powered: e.details?.agentPowered || false,
  }));

  // Find key decisions
  const keyDecisions = events
    .filter((e) => e.reasoning && e.reasoning.length > 20)
    .map((e) => ({
      event: e.eventType,
      reasoning: e.reasoning,
      factors: e.decisionFactors,
    }));

  return c.json({
    lease_id: leaseId,
    current_status: lease.status,
    agent_id: lease.tenantAgentId,
    gpu_type: lease.gpuType,
    timeline,
    key_decisions: keyDecisions,
    summary: generateExplainSummary(lease, events),
  });
});

/**
 * Ask a natural language question about a lease (uses LLM)
 */
chatRoutes.post("/explain/ask", async (c) => {
  const body = await c.req.json();
  const { lease_id, question } = body;

  if (!lease_id || !question) {
    return c.json({ error: "lease_id and question required" }, 400);
  }

  try {
    // Use chatbot to explain, but prepend context
    const chatbot = getChatbot();
    const prompt = `Regarding lease ${lease_id}: ${question}

Please look up this lease and explain what happened. Do NOT take any actions - just explain the decisions that were made.`;

    const response = await chatbot.chat(prompt);

    return c.json({
      lease_id,
      question,
      explanation: response.text,
      sources: response.functionResults?.map((f) => f.name),
    });
  } catch (error) {
    log.error("Explain error", { error: (error as Error).message });
    return c.json({ error: "Explain failed", details: (error as Error).message }, 500);
  }
});

/**
 * Get recent system activity with explanations
 */
chatRoutes.get("/explain/recent", async (c) => {
  const limit = parseInt(c.req.query("limit") || "20", 10);

  const events = await getRecentAuditEvents(limit);

  // Group by lease
  const byLease = new Map<string, typeof events>();
  for (const event of events) {
    if (event.leaseId) {
      const existing = byLease.get(event.leaseId) || [];
      existing.push(event);
      byLease.set(event.leaseId, existing);
    }
  }

  // Build summaries
  const summaries = [];
  for (const [leaseId, leaseEvents] of byLease) {
    const lastEvent = leaseEvents[0];
    summaries.push({
      lease_id: leaseId,
      latest_event: lastEvent.eventType,
      latest_reasoning: lastEvent.reasoning,
      event_count: leaseEvents.length,
      timestamp: lastEvent.timestamp.toISOString(),
      llm_powered: leaseEvents.some((e) => e.details?.agentPowered),
    });
  }

  return c.json({
    recent_activity: summaries.slice(0, 10),
    total_events: events.length,
    events: events.map((e) => ({
      id: e.id,
      type: e.eventType,
      lease_id: e.leaseId,
      reasoning: e.reasoning,
      timestamp: e.timestamp.toISOString(),
      llm_powered: e.details?.agentPowered || false,
    })),
  });
});

// Helper to generate explanation summary
function generateExplainSummary(
  lease: { status: string; tenantAgentId: string; gpuType: string },
  events: Array<{ eventType: string; reasoning?: string | null }>
): string {
  const eventTypes = events.map((e) => e.eventType);

  if (eventTypes.includes("lease_granted")) {
    const grantEvent = events.find((e) => e.eventType === "lease_granted");
    return `Lease was granted to ${lease.tenantAgentId} for ${lease.gpuType}. ${grantEvent?.reasoning || ""}`;
  }

  if (eventTypes.includes("lease_lost")) {
    const lostEvent = events.find((e) => e.eventType === "lease_lost");
    return `Lease was lost. ${lostEvent?.reasoning || "The lease was preempted or evicted."}`;
  }

  if (eventTypes.includes("checkpoint_completed")) {
    return `Lease successfully checkpointed and is ready for resumption.`;
  }

  if (lease.status === "pending") {
    return `Lease is pending assignment. Waiting for available capacity.`;
  }

  if (lease.status === "active") {
    return `Lease is currently active with ${lease.gpuType} capacity assigned.`;
  }

  return `Lease status: ${lease.status}`;
}
