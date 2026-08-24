/**
 * Tenant database operations.
 */

import { createHash, randomBytes } from "crypto";
import { getFirestore } from "./firestore.js";
import { createLogger } from "../utils/logger.js";
import {
  Tenant,
  TenantStatus,
  TenantTier,
  ApiKey,
  ApiKeyScope,
  DEFAULT_SCOPES_BY_TIER,
  LEASE_LIMITS_BY_TIER,
  CreateTenantInput,
  CreateApiKeyInput,
} from "../models/tenant.js";

const log = createLogger({ module: "db:tenants" });

// ============================================================================
// Tenant Operations
// ============================================================================

/**
 * Generate a tenant ID.
 */
function generateTenantId(): string {
  return `tenant_${randomBytes(8).toString("hex")}`;
}

/**
 * Create a new tenant.
 */
export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  const db = getFirestore();
  const id = generateTenantId();

  const tenant: Tenant = {
    id,
    name: input.name,
    email: input.email,
    status: TenantStatus.ACTIVE,
    tier: input.tier ?? TenantTier.FREE,
    maxConcurrentLeases: LEASE_LIMITS_BY_TIER[input.tier ?? TenantTier.FREE],
    maxGpuHoursPerMonth: 100, // Default 100 hours
    allowedGpuTypes: ["nvidia-t4", "nvidia-l4"], // Default GPU types
    currentLeaseCount: 0,
    gpuHoursUsedThisMonth: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection("tenants").doc(id).set({
    ...tenant,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  });

  log.info("Created tenant", { tenantId: id, email: input.email });
  return tenant;
}

/**
 * Get a tenant by ID.
 */
export async function getTenant(tenantId: string): Promise<Tenant | null> {
  const db = getFirestore();
  const doc = await db.collection("tenants").doc(tenantId).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  } as Tenant;
}

/**
 * Get a tenant by email.
 */
export async function getTenantByEmail(email: string): Promise<Tenant | null> {
  const db = getFirestore();
  const snapshot = await db
    .collection("tenants")
    .where("email", "==", email)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  } as Tenant;
}

/**
 * Update tenant lease count.
 */
export async function updateTenantLeaseCount(
  tenantId: string,
  delta: number
): Promise<void> {
  const db = getFirestore();
  const ref = db.collection("tenants").doc(tenantId);

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const currentCount = doc.data()!.currentLeaseCount ?? 0;
    tx.update(ref, {
      currentLeaseCount: Math.max(0, currentCount + delta),
      updatedAt: new Date().toISOString(),
    });
  });

  log.debug("Updated tenant lease count", { tenantId, delta });
}

/**
 * Check if tenant can create a new lease.
 */
export async function canTenantCreateLease(tenantId: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const tenant = await getTenant(tenantId);

  if (!tenant) {
    return { allowed: false, reason: "Tenant not found" };
  }

  if (tenant.status !== TenantStatus.ACTIVE) {
    return { allowed: false, reason: `Tenant status is ${tenant.status}` };
  }

  if (tenant.currentLeaseCount >= tenant.maxConcurrentLeases) {
    return {
      allowed: false,
      reason: `Max concurrent leases (${tenant.maxConcurrentLeases}) reached`,
    };
  }

  return { allowed: true };
}

// ============================================================================
// API Key Operations
// ============================================================================

/**
 * Generate a new API key.
 * Returns the raw key (only shown once) and the key document.
 */
export async function createApiKey(
  tenantId: string,
  input: CreateApiKeyInput
): Promise<{ key: string; apiKey: ApiKey }> {
  const db = getFirestore();

  // Generate key: xidr_sk_<32 random bytes as hex>
  const rawKey = `xidr_sk_${randomBytes(32).toString("hex")}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12); // "xidr_sk_xxxx"
  const keyId = `key_${randomBytes(8).toString("hex")}`;

  // Get tenant for default scopes
  const tenant = await getTenant(tenantId);
  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  const scopes =
    input.scopes && input.scopes.length > 0
      ? input.scopes
      : DEFAULT_SCOPES_BY_TIER[tenant.tier];

  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const apiKey: ApiKey = {
    id: keyId,
    tenantId,
    name: input.name,
    keyHash,
    keyPrefix,
    scopes,
    active: true,
    lastUsedAt: null,
    expiresAt,
    createdAt: new Date(),
    revokedAt: null,
  };

  await db.collection("api_keys").doc(keyId).set({
    ...apiKey,
    expiresAt: expiresAt?.toISOString() ?? null,
    createdAt: apiKey.createdAt.toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  });

  log.info("Created API key", { keyId, tenantId, name: input.name });
  return { key: rawKey, apiKey };
}

/**
 * Hash an API key for storage.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Validate an API key and return the associated tenant.
 */
export async function validateApiKey(key: string): Promise<{
  valid: boolean;
  tenant?: Tenant;
  apiKey?: ApiKey;
  error?: string;
}> {
  const db = getFirestore();
  const keyHash = hashApiKey(key);

  // Find key by hash
  const snapshot = await db
    .collection("api_keys")
    .where("keyHash", "==", keyHash)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return { valid: false, error: "Invalid API key" };
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  const apiKey: ApiKey = {
    ...data,
    id: doc.id,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    createdAt: new Date(data.createdAt),
    lastUsedAt: data.lastUsedAt ? new Date(data.lastUsedAt) : null,
    revokedAt: data.revokedAt ? new Date(data.revokedAt) : null,
  } as ApiKey;

  // Check if key is active
  if (!apiKey.active) {
    return { valid: false, error: "API key is inactive" };
  }

  // Check if key is expired
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return { valid: false, error: "API key has expired" };
  }

  // Check if key is revoked
  if (apiKey.revokedAt) {
    return { valid: false, error: "API key has been revoked" };
  }

  // Get tenant
  const tenant = await getTenant(apiKey.tenantId);
  if (!tenant) {
    return { valid: false, error: "Tenant not found" };
  }

  if (tenant.status !== TenantStatus.ACTIVE) {
    return { valid: false, error: `Tenant is ${tenant.status}` };
  }

  // Update last used
  await db.collection("api_keys").doc(apiKey.id).update({
    lastUsedAt: new Date().toISOString(),
  });

  return { valid: true, tenant, apiKey };
}

/**
 * Check if an API key has a specific scope.
 */
export function hasScope(apiKey: ApiKey, scope: ApiKeyScope): boolean {
  return apiKey.scopes.includes(scope) || apiKey.scopes.includes(ApiKeyScope.ADMIN_FULL);
}

/**
 * Revoke an API key.
 */
export async function revokeApiKey(keyId: string): Promise<void> {
  const db = getFirestore();
  await db.collection("api_keys").doc(keyId).update({
    active: false,
    revokedAt: new Date().toISOString(),
  });

  log.info("Revoked API key", { keyId });
}

/**
 * List API keys for a tenant.
 */
export async function listApiKeys(tenantId: string): Promise<ApiKey[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection("api_keys")
    .where("tenantId", "==", tenantId)
    .where("active", "==", true)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      createdAt: new Date(data.createdAt),
      lastUsedAt: data.lastUsedAt ? new Date(data.lastUsedAt) : null,
      revokedAt: data.revokedAt ? new Date(data.revokedAt) : null,
    } as ApiKey;
  });
}
