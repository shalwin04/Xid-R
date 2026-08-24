/**
 * Audit event data model.
 *
 * Audit events track all significant actions for explainability and debugging.
 */

import { z } from "zod";

export const EventType = {
  LEASE_REQUESTED: "lease_requested",
  LEASE_GRANTED: "lease_granted",
  LEASE_DENIED: "lease_denied",
  RECLAIM_INITIATED: "reclaim_initiated",
  NEGOTIATION_STARTED: "negotiation_started",
  NEGOTIATION_COMPLETED: "negotiation_completed",
  CHECKPOINT_STARTED: "checkpoint_started",
  CHECKPOINT_COMPLETED: "checkpoint_completed",
  CHECKPOINT_FAILED: "checkpoint_failed",
  RESUME_STARTED: "resume_started",
  RESUME_COMPLETED: "resume_completed",
  LEASE_RELEASED: "lease_released",
  LEASE_LOST: "lease_lost",
  CAPACITY_DISCOVERED: "capacity_discovered",
  CAPACITY_MARKED_HARVESTABLE: "capacity_marked_harvestable",
  CAPACITY_RECLAIMED: "capacity_reclaimed",
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

export const EventSource = {
  SCHEDULER: "scheduler",
  NEGOTIATOR: "negotiator",
  CAPACITY_FABRIC: "capacity_fabric",
  TENANT_AGENT: "tenant_agent",
  API: "api",
  SYSTEM: "system",
} as const;

export type EventSource = (typeof EventSource)[keyof typeof EventSource];

export const AuditEventSchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  eventType: z.string(),

  // References
  leaseId: z.string().nullable().default(null),
  capacityUnitId: z.string().nullable().default(null),
  agentId: z.string().nullable().default(null),

  // Event details
  details: z.record(z.unknown()).default({}),

  // For xidr_explain
  reasoning: z.string().nullable().default(null),
  decisionFactors: z.array(z.string()).default([]),

  // Metadata
  source: z.string(),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export interface CreateAuditEventInput {
  eventType: EventType;
  source: EventSource;
  leaseId?: string;
  capacityUnitId?: string;
  agentId?: string;
  details?: Record<string, unknown>;
  reasoning?: string;
  decisionFactors?: string[];
}

/**
 * Create an audit event with auto-generated ID and timestamp.
 */
export function createAuditEvent(input: CreateAuditEventInput): Omit<AuditEvent, "id"> {
  return {
    timestamp: new Date(),
    eventType: input.eventType,
    source: input.source,
    leaseId: input.leaseId ?? null,
    capacityUnitId: input.capacityUnitId ?? null,
    agentId: input.agentId ?? null,
    details: input.details ?? {},
    reasoning: input.reasoning ?? null,
    decisionFactors: input.decisionFactors ?? [],
  };
}

/**
 * Convert Firestore document to AuditEvent.
 */
export function auditEventFromFirestore(
  id: string,
  data: Record<string, unknown>
): AuditEvent {
  return {
    ...data,
    id,
    timestamp: (data.timestamp as { toDate: () => Date })?.toDate?.() ?? new Date(),
  } as AuditEvent;
}

/**
 * Format audit event for display.
 */
export function formatAuditEvent(event: AuditEvent): string {
  const time = event.timestamp.toISOString();
  const type = event.eventType.replace(/_/g, " ");
  let msg = `[${time}] ${type}`;

  if (event.leaseId) {
    msg += ` (lease: ${event.leaseId})`;
  }
  if (event.reasoning) {
    msg += `\n  Reason: ${event.reasoning}`;
  }
  if (event.decisionFactors.length > 0) {
    msg += `\n  Factors: ${event.decisionFactors.join(", ")}`;
  }

  return msg;
}
