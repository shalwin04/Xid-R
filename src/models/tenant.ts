/**
 * Tenant and API Key models for multi-tenant authentication.
 */

import { z } from "zod";

/**
 * Tenant status.
 */
export enum TenantStatus {
  ACTIVE = "active",
  SUSPENDED = "suspended",
  PENDING = "pending",
}

/**
 * Tenant tier for feature gating and rate limits.
 */
export enum TenantTier {
  FREE = "free",
  STARTER = "starter",
  PROFESSIONAL = "professional",
  ENTERPRISE = "enterprise",
}

/**
 * Tenant document stored in Firestore.
 */
export interface Tenant {
  id: string;
  name: string;
  email: string;
  status: TenantStatus;
  tier: TenantTier;

  // Limits
  maxConcurrentLeases: number;
  maxGpuHoursPerMonth: number;
  allowedGpuTypes: string[];

  // Usage tracking
  currentLeaseCount: number;
  gpuHoursUsedThisMonth: number;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * API key document stored in Firestore.
 */
export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;

  // Security: Store hash, not the actual key
  keyHash: string;
  keyPrefix: string; // First 8 chars for identification (e.g., "xidr_sk_")

  // Permissions
  scopes: ApiKeyScope[];

  // State
  active: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;

  // Metadata
  createdAt: Date;
  revokedAt: Date | null;
}

/**
 * API key scopes for fine-grained permissions.
 */
export enum ApiKeyScope {
  // Lease operations
  LEASE_REQUEST = "lease:request",
  LEASE_RELEASE = "lease:release",
  LEASE_READ = "lease:read",

  // Checkpoint operations
  CHECKPOINT_WRITE = "checkpoint:write",
  CHECKPOINT_READ = "checkpoint:read",

  // Status and explain
  STATUS_READ = "status:read",
  EXPLAIN_READ = "explain:read",

  // Admin operations
  ADMIN_FULL = "admin:full",
}

/**
 * Default scopes by tier.
 */
export const DEFAULT_SCOPES_BY_TIER: Record<TenantTier, ApiKeyScope[]> = {
  [TenantTier.FREE]: [
    ApiKeyScope.LEASE_REQUEST,
    ApiKeyScope.LEASE_RELEASE,
    ApiKeyScope.LEASE_READ,
    ApiKeyScope.CHECKPOINT_WRITE,
    ApiKeyScope.CHECKPOINT_READ,
    ApiKeyScope.STATUS_READ,
  ],
  [TenantTier.STARTER]: [
    ApiKeyScope.LEASE_REQUEST,
    ApiKeyScope.LEASE_RELEASE,
    ApiKeyScope.LEASE_READ,
    ApiKeyScope.CHECKPOINT_WRITE,
    ApiKeyScope.CHECKPOINT_READ,
    ApiKeyScope.STATUS_READ,
    ApiKeyScope.EXPLAIN_READ,
  ],
  [TenantTier.PROFESSIONAL]: [
    ApiKeyScope.LEASE_REQUEST,
    ApiKeyScope.LEASE_RELEASE,
    ApiKeyScope.LEASE_READ,
    ApiKeyScope.CHECKPOINT_WRITE,
    ApiKeyScope.CHECKPOINT_READ,
    ApiKeyScope.STATUS_READ,
    ApiKeyScope.EXPLAIN_READ,
  ],
  [TenantTier.ENTERPRISE]: [
    ApiKeyScope.LEASE_REQUEST,
    ApiKeyScope.LEASE_RELEASE,
    ApiKeyScope.LEASE_READ,
    ApiKeyScope.CHECKPOINT_WRITE,
    ApiKeyScope.CHECKPOINT_READ,
    ApiKeyScope.STATUS_READ,
    ApiKeyScope.EXPLAIN_READ,
    ApiKeyScope.ADMIN_FULL,
  ],
};

/**
 * Rate limits by tier (requests per minute).
 */
export const RATE_LIMITS_BY_TIER: Record<TenantTier, { requestsPerMinute: number; burstSize: number }> = {
  [TenantTier.FREE]: { requestsPerMinute: 60, burstSize: 10 },
  [TenantTier.STARTER]: { requestsPerMinute: 300, burstSize: 50 },
  [TenantTier.PROFESSIONAL]: { requestsPerMinute: 1000, burstSize: 100 },
  [TenantTier.ENTERPRISE]: { requestsPerMinute: 5000, burstSize: 500 },
};

/**
 * Concurrent lease limits by tier.
 */
export const LEASE_LIMITS_BY_TIER: Record<TenantTier, number> = {
  [TenantTier.FREE]: 1,
  [TenantTier.STARTER]: 5,
  [TenantTier.PROFESSIONAL]: 20,
  [TenantTier.ENTERPRISE]: 100,
};

/**
 * Zod schemas for validation.
 */
export const CreateTenantSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  tier: z.nativeEnum(TenantTier).optional().default(TenantTier.FREE),
});

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.nativeEnum(ApiKeyScope)).optional(),
  expiresInDays: z.number().min(1).max(365).optional(),
});

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;
export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
