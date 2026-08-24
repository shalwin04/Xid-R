/**
 * Authentication middleware for API routes.
 */

import type { Context, Next, MiddlewareHandler } from "hono";
import { validateApiKey, hasScope } from "../db/tenants.js";
import { Tenant, ApiKey, ApiKeyScope, TenantStatus, TenantTier, RATE_LIMITS_BY_TIER } from "../models/tenant.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger({ module: "auth" });

// Rate limit tracking (in-memory for now, use Redis for production)
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Extended context with tenant information.
 */
declare module "hono" {
  interface ContextVariableMap {
    tenant: Tenant;
    apiKey: ApiKey;
    tenantId: string;
    requestId: string;
  }
}

/**
 * Extract API key from request.
 */
function extractApiKey(c: Context): string | null {
  // Check Authorization header
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check X-API-Key header
  const apiKeyHeader = c.req.header("X-API-Key");
  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  return null;
}

/**
 * Authentication middleware.
 * Validates API key and sets tenant context.
 */
export function authMiddleware(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const apiKey = extractApiKey(c);

    if (!apiKey) {
      return c.json(
        {
          error: "Missing API key",
          message: "Provide API key via Authorization: Bearer <key> or X-API-Key header",
        },
        401
      );
    }

    const result = await validateApiKey(apiKey);

    if (!result.valid) {
      log.warn("Invalid API key attempt", { error: result.error });
      return c.json(
        {
          error: "Invalid API key",
          message: result.error,
        },
        401
      );
    }

    // Set tenant context
    c.set("tenant", result.tenant!);
    c.set("apiKey", result.apiKey!);
    c.set("tenantId", result.tenant!.id);

    log.debug("Authenticated request", {
      tenantId: result.tenant!.id,
      keyId: result.apiKey!.id,
    });

    await next();
  };
}

/**
 * Scope authorization middleware.
 * Checks if the API key has required scope(s).
 */
export function requireScope(...scopes: ApiKeyScope[]): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const apiKey = c.get("apiKey");

    if (!apiKey) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const hasAllScopes = scopes.every((scope) => hasScope(apiKey, scope));

    if (!hasAllScopes) {
      log.warn("Insufficient permissions", {
        keyId: apiKey.id,
        required: scopes,
        has: apiKey.scopes,
      });
      return c.json(
        {
          error: "Insufficient permissions",
          required: scopes,
        },
        403
      );
    }

    await next();
  };
}

/**
 * Rate limiting middleware.
 */
export function rateLimitMiddleware(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const tenant = c.get("tenant");

    if (!tenant) {
      // No tenant context, skip rate limiting
      await next();
      return;
    }

    const limits = RATE_LIMITS_BY_TIER[tenant.tier];
    const bucketKey = tenant.id;
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window

    // Get or create bucket
    let bucket = rateLimitBuckets.get(bucketKey);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateLimitBuckets.set(bucketKey, bucket);
    }

    // Check burst limit
    if (bucket.count >= limits.burstSize) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", String(limits.requestsPerMinute));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

      log.warn("Rate limit exceeded", {
        tenantId: tenant.id,
        tier: tenant.tier,
        count: bucket.count,
        limit: limits.burstSize,
      });

      return c.json(
        {
          error: "Rate limit exceeded",
          retryAfter,
          limit: limits.requestsPerMinute,
        },
        429
      );
    }

    // Increment counter
    bucket.count++;

    // Set rate limit headers
    c.header("X-RateLimit-Limit", String(limits.requestsPerMinute));
    c.header("X-RateLimit-Remaining", String(limits.burstSize - bucket.count));
    c.header("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    await next();
  };
}

/**
 * Optional auth middleware - sets tenant context if API key provided,
 * but doesn't reject requests without auth.
 */
export function optionalAuthMiddleware(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const apiKey = extractApiKey(c);

    if (apiKey) {
      const result = await validateApiKey(apiKey);

      if (result.valid) {
        c.set("tenant", result.tenant!);
        c.set("apiKey", result.apiKey!);
        c.set("tenantId", result.tenant!.id);
      }
    }

    await next();
  };
}

/**
 * Development mode bypass - allows unauthenticated access.
 * Only use for local development.
 */
export function devAuthBypass(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    // Check if already authenticated
    if (c.get("tenant")) {
      await next();
      return;
    }

    // Create a fake dev tenant
    const devTenant: Tenant = {
      id: "tenant_dev",
      name: "Development Tenant",
      email: "dev@localhost",
      status: TenantStatus.ACTIVE,
      tier: TenantTier.ENTERPRISE,
      maxConcurrentLeases: 100,
      maxGpuHoursPerMonth: 10000,
      allowedGpuTypes: ["nvidia-t4", "nvidia-l4", "nvidia-a100-40gb", "nvidia-a100-80gb"],
      currentLeaseCount: 0,
      gpuHoursUsedThisMonth: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const devApiKey: ApiKey = {
      id: "key_dev",
      tenantId: "tenant_dev",
      name: "Development Key",
      keyHash: "",
      keyPrefix: "xidr_dev_",
      scopes: Object.values(ApiKeyScope),
      active: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      revokedAt: null,
    };

    c.set("tenant", devTenant);
    c.set("apiKey", devApiKey);
    c.set("tenantId", devTenant.id);

    await next();
  };
}
