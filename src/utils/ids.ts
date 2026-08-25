/**
 * ID generation utilities for Xid-R.
 */

import { v4 as uuidv4 } from "uuid";

/**
 * Generate a lease ID.
 */
export function generateLeaseId(): string {
  return `lease_${uuidv4().slice(0, 8)}`;
}

/**
 * Generate a capacity unit ID.
 */
export function generateCapacityUnitId(type: string, identifier: string): string {
  return `unit_${type}_${identifier}`;
}

/**
 * Generate an audit event ID.
 */
export function generateAuditEventId(): string {
  return `evt_${Date.now()}_${uuidv4().slice(0, 6)}`;
}

/**
 * Generate an agent ID.
 */
export function generateAgentId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 20);
  return `agent_${slug}_${uuidv4().slice(0, 6)}`;
}

/**
 * Generate a checkpoint ID.
 */
export function generateCheckpointId(leaseId: string): string {
  return `ckpt_${leaseId.replace("lease_", "")}_${Date.now()}`;
}

/**
 * Generate a request ID for tracing.
 */
export function generateRequestId(): string {
  return `req_${uuidv4().slice(0, 12)}`;
}

/**
 * Generate a generic prefixed ID.
 */
export function generateId(prefix: string): string {
  return `${prefix}_${uuidv4().slice(0, 12)}`;
}

/**
 * Generate a tenant ID.
 */
export function generateTenantId(): string {
  return generateId("tenant");
}

/**
 * Generate an organization ID.
 */
export function generateOrganizationId(): string {
  return generateId("org");
}

/**
 * Generate an API key ID.
 */
export function generateApiKeyId(): string {
  return generateId("key");
}
