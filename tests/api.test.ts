/**
 * API Integration Tests
 *
 * These tests require a running server on localhost:8080
 * Run with: npm run start (in separate terminal)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const API_BASE = process.env.API_BASE_URL || "http://localhost:8080";

// Helper to check server availability
const checkServer = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
};

describe("API Integration Tests", () => {
  let serverAvailable = false;

  beforeAll(async () => {
    serverAvailable = await checkServer();
    if (!serverAvailable) {
      console.log("⚠️  Server not available at", API_BASE, "- skipping integration tests");
    }
  });

  describe("Health Endpoint", () => {
    it("should return healthy status", async ({ skip }) => {
      if (!serverAvailable) skip();

      const response = await fetch(`${API_BASE}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.version).toBeDefined();
    });
  });

  describe("MCP Tools Discovery", () => {
    it("should list available tools", async ({ skip }) => {
      if (!serverAvailable) skip();

      const response = await fetch(`${API_BASE}/mcp/tools`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tools).toBeInstanceOf(Array);
      expect(data.tools.length).toBeGreaterThan(0);

      const toolNames = data.tools.map((t: { name: string }) => t.name);
      expect(toolNames).toContain("xidr_request_gpu");
      expect(toolNames).toContain("xidr_checkpoint_ack");
      expect(toolNames).toContain("xidr_release");
      expect(toolNames).toContain("xidr_status");
      expect(toolNames).toContain("xidr_explain");
    });
  });

  describe("xidr_status Tool", () => {
    it("should return system status when no lease_id provided", async ({ skip }) => {
      if (!serverAvailable) skip();

      const response = await fetch(`${API_BASE}/mcp/tools/xidr_status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.system).toBeDefined();
      expect(typeof data.system.active_leases).toBe("number");
      expect(typeof data.system.pending_requests).toBe("number");
      expect(typeof data.system.completed_leases).toBe("number");
      expect(data.system.available_capacity).toBeDefined();
      expect(data.system.capacity_summary).toBeDefined();
    });

    it("should return 404 for non-existent lease", async ({ skip }) => {
      if (!serverAvailable) skip();

      const response = await fetch(`${API_BASE}/mcp/tools/xidr_status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lease_id: "nonexistent_lease_12345" }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe("Leases API", () => {
    it("should list leases", async ({ skip }) => {
      if (!serverAvailable) skip();

      const response = await fetch(`${API_BASE}/api/leases`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.leases).toBeInstanceOf(Array);
      expect(data.counts).toBeDefined();
    });

    it("should get pending queue", async ({ skip }) => {
      if (!serverAvailable) skip();

      const response = await fetch(`${API_BASE}/api/leases/queue/pending`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.queue).toBeInstanceOf(Array);
    });

    it("should get lease stats", async ({ skip }) => {
      if (!serverAvailable) skip();

      const response = await fetch(`${API_BASE}/api/leases/stats/summary`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats).toBeDefined();
    });
  });

  describe("Capacity API", () => {
    it("should list capacity units", async ({ skip }) => {
      if (!serverAvailable) skip();

      const response = await fetch(`${API_BASE}/api/capacity`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.capacity_units).toBeInstanceOf(Array);
    });

    it("should get capacity summary", async ({ skip }) => {
      if (!serverAvailable) skip();

      const response = await fetch(`${API_BASE}/api/capacity/summary`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.summary).toBeDefined();
      expect(typeof data.summary.total).toBe("number");
      expect(typeof data.summary.available).toBe("number");
    });
  });

  describe("GPU Request Flow", () => {
    let testLeaseId: string | null = null;

    afterAll(async () => {
      // Clean up: release test lease if it was created
      if (testLeaseId && serverAvailable) {
        try {
          await fetch(`${API_BASE}/mcp/tools/xidr_release`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lease_id: testLeaseId }),
          });
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it("should request GPU and get response", async ({ skip }) => {
      if (!serverAvailable) skip();

      const response = await fetch(`${API_BASE}/mcp/tools/xidr_request_gpu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gpu_type: "nvidia-l4",
          duration_hint_seconds: 300,
          priority: "low",
          a2a_endpoint: "http://localhost:9999/a2a",
          checkpointable: true,
          agent_id: `test-agent-${Date.now()}`,
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.lease_id).toBeDefined();
      expect(["granted", "queued"]).toContain(data.status);

      testLeaseId = data.lease_id;

      if (data.status === "granted") {
        expect(data.capacity_unit_id).toBeDefined();
        expect(data.connection_info).toBeDefined();
        expect(data.checkpoint_target_uri).toBeDefined();
      } else {
        expect(typeof data.queue_position).toBe("number");
      }
    });

    it("should get lease status", async ({ skip }) => {
      if (!serverAvailable || !testLeaseId) skip();

      const response = await fetch(`${API_BASE}/mcp/tools/xidr_status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lease_id: testLeaseId }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.lease).toBeDefined();
      expect(data.lease.id).toBe(testLeaseId);
    });

    it("should release lease", async ({ skip }) => {
      if (!serverAvailable || !testLeaseId) skip();

      const response = await fetch(`${API_BASE}/mcp/tools/xidr_release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lease_id: testLeaseId }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.released).toBe(true);
      expect(typeof data.billable_seconds).toBe("number");

      testLeaseId = null; // Clear so afterAll doesn't try to release again
    });
  });

  describe("Input Validation", () => {
    it("should reject invalid GPU type", async ({ skip }) => {
      if (!serverAvailable) skip();

      const response = await fetch(`${API_BASE}/mcp/tools/xidr_request_gpu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gpu_type: "invalid-gpu",
          a2a_endpoint: "http://localhost:9999/a2a",
        }),
      });

      expect(response.status).toBe(400);
    });

    it("should reject missing required fields", async ({ skip }) => {
      if (!serverAvailable) skip();

      const response = await fetch(`${API_BASE}/mcp/tools/xidr_request_gpu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gpu_type: "nvidia-t4",
          // Missing a2a_endpoint
        }),
      });

      expect(response.status).toBe(400);
    });

    it("should reject invalid JSON", async ({ skip }) => {
      if (!serverAvailable) skip();

      const response = await fetch(`${API_BASE}/mcp/tools/xidr_request_gpu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });

      // Should return 400 or 500 for invalid JSON
      expect([400, 500]).toContain(response.status);
    });
  });
});
