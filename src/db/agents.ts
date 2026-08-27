/**
 * Agent card collection operations.
 */

import { FieldValue } from "@google-cloud/firestore";
import {
  AgentCard,
  RegisterAgentInput,
  createAgentCard,
  agentCardFromFirestore,
} from "../models/agent.js";
import { createLogger } from "../utils/logger.js";
import { getCollection, Collections } from "./firestore.js";

const logger = createLogger({ module: "db:agents" });

/**
 * Register or update an agent.
 */
export async function registerAgent(input: RegisterAgentInput): Promise<AgentCard> {
  const existing = await getAgentCard(input.id);

  if (existing) {
    // Update existing agent
    return updateAgentCard(input.id, {
      name: input.name,
      description: input.description,
      a2aEndpoint: input.a2aEndpoint,
      supportedTasks: input.supportedTasks,
      checkpointable: input.checkpointable,
      estimatedCheckpointSizeBytes: input.estimatedCheckpointSizeBytes,
      lastSeenAt: new Date(),
    }) as Promise<AgentCard>;
  }

  const card = createAgentCard(input);
  await getCollection(Collections.AGENT_CARDS).doc(input.id).set(card);
  logger.info("Registered agent", { agentId: input.id, name: input.name });

  return card;
}

/**
 * Get an agent card by ID.
 */
export async function getAgentCard(id: string): Promise<AgentCard | null> {
  const doc = await getCollection(Collections.AGENT_CARDS).doc(id).get();
  if (!doc.exists) return null;
  return agentCardFromFirestore(doc.id, doc.data() as Record<string, unknown>);
}

/**
 * Update an agent card.
 */
export async function updateAgentCard(
  id: string,
  updates: Partial<Omit<AgentCard, "id" | "registeredAt">>
): Promise<AgentCard | null> {
  const ref = getCollection(Collections.AGENT_CARDS).doc(id);

  // Filter out undefined values (Firestore doesn't accept them)
  const cleanedUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      cleanedUpdates[key] = value;
    }
  }

  await ref.update(cleanedUpdates);

  const doc = await ref.get();
  if (!doc.exists) return null;
  return agentCardFromFirestore(doc.id, doc.data() as Record<string, unknown>);
}

/**
 * Update last seen timestamp.
 */
export async function touchAgent(id: string): Promise<void> {
  await getCollection(Collections.AGENT_CARDS).doc(id).update({
    lastSeenAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Update observed checkpoint duration (for learning).
 */
export async function updateCheckpointStats(
  id: string,
  durationMs: number,
  sizeBytes: number
): Promise<void> {
  await getCollection(Collections.AGENT_CARDS).doc(id).update({
    observedCheckpointDurationMs: durationMs,
    estimatedCheckpointSizeBytes: sizeBytes,
    lastSeenAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Get all registered agents.
 */
export async function getAllAgents(): Promise<AgentCard[]> {
  const snapshot = await getCollection(Collections.AGENT_CARDS).get();
  return snapshot.docs.map((doc) =>
    agentCardFromFirestore(doc.id, doc.data() as Record<string, unknown>)
  );
}

/**
 * Get agents by trust tier.
 */
export async function getAgentsByTrustTier(trustTier: string): Promise<AgentCard[]> {
  const snapshot = await getCollection(Collections.AGENT_CARDS)
    .where("trustTier", "==", trustTier)
    .get();

  return snapshot.docs.map((doc) =>
    agentCardFromFirestore(doc.id, doc.data() as Record<string, unknown>)
  );
}

/**
 * Delete an agent card.
 */
export async function deleteAgentCard(id: string): Promise<void> {
  await getCollection(Collections.AGENT_CARDS).doc(id).delete();
  logger.info("Deleted agent card", { agentId: id });
}
