/**
 * Tenant management API routes.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import {
  createTenant,
  getTenant,
  getTenantByEmail,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "../../db/tenants.js";
import { CreateTenantSchema, CreateApiKeySchema } from "../../models/tenant.js";
import { authMiddleware, requireScope } from "../../middleware/auth.js";
import { ApiKeyScope } from "../../models/tenant.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger({ module: "api:tenants" });

export const tenantRoutes = new Hono();

// ============================================================================
// Public Routes (No Auth Required)
// ============================================================================

/**
 * Register a new tenant.
 * POST /api/tenants/register
 */
tenantRoutes.post(
  "/register",
  zValidator("json", CreateTenantSchema),
  async (c) => {
    const input = c.req.valid("json");

    try {
      // Check if email already exists
      const existing = await getTenantByEmail(input.email);
      if (existing) {
        return c.json(
          { error: "Email already registered" },
          409
        );
      }

      // Create tenant
      const tenant = await createTenant(input);

      // Create initial API key
      const { key, apiKey } = await createApiKey(tenant.id, {
        name: "Default API Key",
      });

      log.info("New tenant registered", {
        tenantId: tenant.id,
        email: input.email,
      });

      return c.json({
        tenant: {
          id: tenant.id,
          name: tenant.name,
          email: tenant.email,
          tier: tenant.tier,
          limits: {
            maxConcurrentLeases: tenant.maxConcurrentLeases,
            maxGpuHoursPerMonth: tenant.maxGpuHoursPerMonth,
          },
        },
        apiKey: {
          id: apiKey.id,
          key, // Only returned once!
          name: apiKey.name,
          scopes: apiKey.scopes,
        },
        message: "Save your API key - it won't be shown again!",
      }, 201);
    } catch (error) {
      log.error("Failed to register tenant", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

// ============================================================================
// Authenticated Routes
// ============================================================================

/**
 * Get current tenant info.
 * GET /api/tenants/me
 */
tenantRoutes.get("/me", authMiddleware(), async (c) => {
  const tenant = c.get("tenant");

  return c.json({
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    status: tenant.status,
    tier: tenant.tier,
    limits: {
      maxConcurrentLeases: tenant.maxConcurrentLeases,
      maxGpuHoursPerMonth: tenant.maxGpuHoursPerMonth,
      allowedGpuTypes: tenant.allowedGpuTypes,
    },
    usage: {
      currentLeaseCount: tenant.currentLeaseCount,
      gpuHoursUsedThisMonth: tenant.gpuHoursUsedThisMonth,
    },
    createdAt: tenant.createdAt.toISOString(),
  });
});

/**
 * List API keys for current tenant.
 * GET /api/tenants/me/keys
 */
tenantRoutes.get("/me/keys", authMiddleware(), async (c) => {
  const tenant = c.get("tenant");

  const keys = await listApiKeys(tenant.id);

  return c.json({
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.keyPrefix,
      scopes: k.scopes,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      expiresAt: k.expiresAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    })),
  });
});

/**
 * Create a new API key.
 * POST /api/tenants/me/keys
 */
tenantRoutes.post(
  "/me/keys",
  authMiddleware(),
  zValidator("json", CreateApiKeySchema),
  async (c) => {
    const tenant = c.get("tenant");
    const input = c.req.valid("json");

    try {
      const { key, apiKey } = await createApiKey(tenant.id, input);

      return c.json({
        id: apiKey.id,
        key, // Only returned once!
        name: apiKey.name,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt?.toISOString() ?? null,
        message: "Save your API key - it won't be shown again!",
      }, 201);
    } catch (error) {
      log.error("Failed to create API key", { error: (error as Error).message });
      return c.json({ error: (error as Error).message }, 500);
    }
  }
);

/**
 * Revoke an API key.
 * DELETE /api/tenants/me/keys/:keyId
 */
tenantRoutes.delete(
  "/me/keys/:keyId",
  authMiddleware(),
  async (c) => {
    const tenant = c.get("tenant");
    const keyId = c.req.param("keyId");

    // Verify key belongs to tenant
    const keys = await listApiKeys(tenant.id);
    const key = keys.find((k) => k.id === keyId);

    if (!key) {
      return c.json({ error: "API key not found" }, 404);
    }

    await revokeApiKey(keyId);

    return c.json({ success: true, message: "API key revoked" });
  }
);

// ============================================================================
// Admin Routes
// ============================================================================

/**
 * Get a tenant by ID (admin only).
 * GET /api/tenants/:tenantId
 */
tenantRoutes.get(
  "/:tenantId",
  authMiddleware(),
  requireScope(ApiKeyScope.ADMIN_FULL),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const tenant = await getTenant(tenantId);

    if (!tenant) {
      return c.json({ error: "Tenant not found" }, 404);
    }

    return c.json({ tenant });
  }
);
