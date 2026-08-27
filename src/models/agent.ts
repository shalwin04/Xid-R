/**
 * Agent card data model.
 *
 * An agent card describes a tenant agent's capabilities and A2A endpoint.
 */

import { z } from "zod";
import { TrustTier } from "./capacity.js";

export const AgentCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),

  // A2A endpoint
  a2aEndpoint: z.string(),
  supportedTasks: z.array(z.string()).default(["reclaim_request", "status_check"]),

  // Capabilities
  checkpointable: z.boolean().default(true),
  estimatedCheckpointSizeBytes: z.number().default(0),
  observedCheckpointDurationMs: z.number().nullable().default(null),

  // Trust
  trustTier: z.enum(["internal", "external", "untrusted"]).default("external"),
  ownerEmail: z.string().optional(),

  // Metadata
  registeredAt: z.date(),
  lastSeenAt: z.date(),
});

export type AgentCard = z.infer<typeof AgentCardSchema>;

export interface RegisterAgentInput {
  id: string;
  name: string;
  description?: string;
  a2aEndpoint: string;
  supportedTasks?: string[];
  checkpointable?: boolean;
  estimatedCheckpointSizeBytes?: number;
  trustTier?: TrustTier;
  ownerEmail?: string;
}

/**
 * Create an agent card from registration input.
 */
export function createAgentCard(input: RegisterAgentInput): Omit<AgentCard, "ownerEmail"> & { ownerEmail?: string } {
  const now = new Date();
  const card: Omit<AgentCard, "ownerEmail"> & { ownerEmail?: string } = {
    id: input.id,
    name: input.name,
    description: input.description ?? "",
    a2aEndpoint: input.a2aEndpoint,
    supportedTasks: input.supportedTasks ?? ["reclaim_request", "status_check"],
    checkpointable: input.checkpointable ?? true,
    estimatedCheckpointSizeBytes: input.estimatedCheckpointSizeBytes ?? 0,
    observedCheckpointDurationMs: null,
    trustTier: input.trustTier ?? "external",
    registeredAt: now,
    lastSeenAt: now,
  };

  // Only include ownerEmail if provided (Firestore doesn't accept undefined)
  if (input.ownerEmail !== undefined) {
    card.ownerEmail = input.ownerEmail;
  }

  return card;
}

/**
 * Convert Firestore document to AgentCard.
 */
export function agentCardFromFirestore(
  id: string,
  data: Record<string, unknown>
): AgentCard {
  return {
    ...data,
    id,
    registeredAt: (data.registeredAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
    lastSeenAt: (data.lastSeenAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
  } as AgentCard;
}

/**
 * Check if agent supports a specific task type.
 */
export function agentSupportsTask(agent: AgentCard, taskType: string): boolean {
  return agent.supportedTasks.includes(taskType);
}
