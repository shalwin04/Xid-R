/**
 * Audit event collection operations.
 */

import {
  AuditEvent,
  CreateAuditEventInput,
  createAuditEvent,
  auditEventFromFirestore,
} from "../models/audit.js";
import { generateAuditEventId } from "../utils/ids.js";
import { createLogger } from "../utils/logger.js";
import { getCollection, Collections } from "./firestore.js";

const logger = createLogger({ module: "db:audit" });

/**
 * Record an audit event.
 */
export async function recordAuditEvent(input: CreateAuditEventInput): Promise<AuditEvent> {
  const id = generateAuditEventId();
  const event = createAuditEvent(input);

  await getCollection(Collections.AUDIT_EVENTS).doc(id).set(event);

  logger.debug("Recorded audit event", {
    eventId: id,
    eventType: input.eventType,
    leaseId: input.leaseId,
  });

  return { id, ...event };
}

/**
 * Get audit events for a lease.
 */
export async function getAuditEventsForLease(leaseId: string): Promise<AuditEvent[]> {
  const snapshot = await getCollection(Collections.AUDIT_EVENTS)
    .where("leaseId", "==", leaseId)
    .orderBy("timestamp", "asc")
    .get();

  return snapshot.docs.map((doc) =>
    auditEventFromFirestore(doc.id, doc.data() as Record<string, unknown>)
  );
}

/**
 * Get audit events for a capacity unit.
 */
export async function getAuditEventsForCapacity(
  capacityUnitId: string
): Promise<AuditEvent[]> {
  const snapshot = await getCollection(Collections.AUDIT_EVENTS)
    .where("capacityUnitId", "==", capacityUnitId)
    .orderBy("timestamp", "asc")
    .get();

  return snapshot.docs.map((doc) =>
    auditEventFromFirestore(doc.id, doc.data() as Record<string, unknown>)
  );
}

/**
 * Get recent audit events.
 */
export async function getRecentAuditEvents(limit: number = 100): Promise<AuditEvent[]> {
  const snapshot = await getCollection(Collections.AUDIT_EVENTS)
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) =>
    auditEventFromFirestore(doc.id, doc.data() as Record<string, unknown>)
  );
}

/**
 * Get audit events by type.
 */
export async function getAuditEventsByType(
  eventType: string,
  limit: number = 100
): Promise<AuditEvent[]> {
  const snapshot = await getCollection(Collections.AUDIT_EVENTS)
    .where("eventType", "==", eventType)
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) =>
    auditEventFromFirestore(doc.id, doc.data() as Record<string, unknown>)
  );
}

/**
 * Generate explanation for a lease based on audit events.
 */
export async function generateLeaseExplanation(
  leaseId: string,
  eventType?: string
): Promise<{
  explanation: string;
  timeline: Array<{ timestamp: string; event: string; details: string }>;
  decisionFactors: string[];
}> {
  const events = await getAuditEventsForLease(leaseId);

  if (events.length === 0) {
    return {
      explanation: `No events found for lease ${leaseId}`,
      timeline: [],
      decisionFactors: [],
    };
  }

  // Filter by event type if specified
  const relevantEvents = eventType
    ? events.filter((e) => e.eventType === eventType)
    : events;

  // Build timeline
  const timeline = relevantEvents.map((e) => ({
    timestamp: e.timestamp.toISOString(),
    event: e.eventType.replace(/_/g, " "),
    details: e.reasoning ?? JSON.stringify(e.details),
  }));

  // Collect decision factors
  const decisionFactors = Array.from(
    new Set(relevantEvents.flatMap((e) => e.decisionFactors))
  );

  // Generate explanation based on events
  const explanationParts: string[] = [];

  for (const event of relevantEvents) {
    if (event.reasoning) {
      explanationParts.push(event.reasoning);
    }
  }

  const explanation =
    explanationParts.length > 0
      ? explanationParts.join(" ")
      : `Lease ${leaseId} had ${events.length} events recorded.`;

  return {
    explanation,
    timeline,
    decisionFactors,
  };
}
