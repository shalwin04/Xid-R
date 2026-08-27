/**
 * Model Tests
 */

import { describe, it, expect } from "vitest";
import {
  createCheckpoint,
  isCheckpointExpired,
  canRestoreCheckpoint,
  CheckpointStatus,
  createEmptyCheckpointState,
} from "../src/models/checkpoint.js";
import {
  LeaseStatus,
  Priority,
  isLeaseActive,
  isLeaseTerminal,
  calculateLeaseSavings,
} from "../src/models/lease.js";
import type { Lease } from "../src/models/lease.js";
import {
  createAgentCard,
} from "../src/models/agent.js";

describe("Checkpoint Model", () => {
  describe("createCheckpoint", () => {
    it("should create checkpoint with required fields", () => {
      const checkpoint = createCheckpoint({
        leaseId: "lease_123",
        agentId: "agent_456",
        uri: "gs://bucket/checkpoint.json",
        sizeBytes: 1024,
      });

      expect(checkpoint.leaseId).toBe("lease_123");
      expect(checkpoint.agentId).toBe("agent_456");
      expect(checkpoint.uri).toBe("gs://bucket/checkpoint.json");
      expect(checkpoint.sizeBytes).toBe(1024);
      expect(checkpoint.status).toBe(CheckpointStatus.COMPLETE);
      expect(checkpoint.format).toBe("json");
    });

    it("should set default expiration to 24 hours", () => {
      const before = Date.now();
      const checkpoint = createCheckpoint({
        leaseId: "lease_123",
        agentId: "agent_456",
        uri: "gs://bucket/checkpoint.json",
        sizeBytes: 1024,
      });
      const after = Date.now();

      const expectedExpiry = 24 * 60 * 60 * 1000; // 24 hours
      const expiresAt = checkpoint.expiresAt.getTime();

      expect(expiresAt).toBeGreaterThanOrEqual(before + expectedExpiry);
      expect(expiresAt).toBeLessThanOrEqual(after + expectedExpiry);
    });

    it("should accept custom expiration", () => {
      const checkpoint = createCheckpoint({
        leaseId: "lease_123",
        agentId: "agent_456",
        uri: "gs://bucket/checkpoint.json",
        sizeBytes: 1024,
        expiresInMs: 60000, // 1 minute
      });

      const now = Date.now();
      const expiresAt = checkpoint.expiresAt.getTime();

      expect(expiresAt - now).toBeLessThanOrEqual(60000 + 100); // Allow 100ms margin
    });

    it("should accept duration", () => {
      const checkpoint = createCheckpoint({
        leaseId: "lease_123",
        agentId: "agent_456",
        uri: "gs://bucket/checkpoint.json",
        sizeBytes: 1024,
        durationMs: 500,
      });

      expect(checkpoint.durationMs).toBe(500);
    });
  });

  describe("isCheckpointExpired", () => {
    it("should return true for expired checkpoint", () => {
      const checkpoint = {
        id: "ckpt_1",
        leaseId: "lease_123",
        agentId: "agent_456",
        uri: "gs://bucket/checkpoint.json",
        sizeBytes: 1024,
        format: "json" as const,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
        durationMs: 100,
        status: CheckpointStatus.COMPLETE,
        restoredToLeaseId: null,
        error: null,
        checkpointVersion: "1.0",
      };

      expect(isCheckpointExpired(checkpoint)).toBe(true);
    });

    it("should return false for valid checkpoint", () => {
      const checkpoint = {
        id: "ckpt_1",
        leaseId: "lease_123",
        agentId: "agent_456",
        uri: "gs://bucket/checkpoint.json",
        sizeBytes: 1024,
        format: "json" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        durationMs: 100,
        status: CheckpointStatus.COMPLETE,
        restoredToLeaseId: null,
        error: null,
        checkpointVersion: "1.0",
      };

      expect(isCheckpointExpired(checkpoint)).toBe(false);
    });
  });

  describe("canRestoreCheckpoint", () => {
    it("should return true for restorable checkpoint", () => {
      const checkpoint = {
        id: "ckpt_1",
        leaseId: "lease_123",
        agentId: "agent_456",
        uri: "gs://bucket/checkpoint.json",
        sizeBytes: 1024,
        format: "json" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        durationMs: 100,
        status: CheckpointStatus.COMPLETE,
        restoredToLeaseId: null,
        error: null,
        checkpointVersion: "1.0",
      };

      expect(canRestoreCheckpoint(checkpoint)).toBe(true);
    });

    it("should return false for already restored checkpoint", () => {
      const checkpoint = {
        id: "ckpt_1",
        leaseId: "lease_123",
        agentId: "agent_456",
        uri: "gs://bucket/checkpoint.json",
        sizeBytes: 1024,
        format: "json" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        durationMs: 100,
        status: CheckpointStatus.COMPLETE,
        restoredToLeaseId: "lease_789",
        error: null,
        checkpointVersion: "1.0",
      };

      expect(canRestoreCheckpoint(checkpoint)).toBe(false);
    });

    it("should return false for failed checkpoint", () => {
      const checkpoint = {
        id: "ckpt_1",
        leaseId: "lease_123",
        agentId: "agent_456",
        uri: "gs://bucket/checkpoint.json",
        sizeBytes: 1024,
        format: "json" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        durationMs: 100,
        status: CheckpointStatus.FAILED,
        restoredToLeaseId: null,
        error: "Upload failed",
        checkpointVersion: "1.0",
      };

      expect(canRestoreCheckpoint(checkpoint)).toBe(false);
    });
  });

  describe("createEmptyCheckpointState", () => {
    it("should create valid state structure", () => {
      const state = createEmptyCheckpointState("test-agent");

      expect(state.checkpointVersion).toBe("1.0");
      expect(state.agentType).toBe("test-agent");
      expect(state.createdAt).toBeDefined();
      expect(state.taskQueue).toEqual([]);
      expect(state.scratchpad).toEqual({});
      expect(state.conversationHistory).toEqual([]);
      expect(state.artifacts).toEqual({});
      expect(state.metadata).toEqual({
        totalApiCalls: 0,
        tokensUsed: 0,
        elapsedTimeSeconds: 0,
      });
    });
  });
});

describe("Lease Model", () => {
  const createMockLease = (overrides: Partial<Lease> = {}): Lease => ({
    id: "lease_123",
    tenantAgentId: "agent_123",
    gpuType: "nvidia-t4",
    a2aEndpoint: "http://localhost:8080/a2a",
    status: LeaseStatus.PENDING,
    priority: Priority.NORMAL,
    durationHintSeconds: 3600,
    checkpointable: true,
    preemptionWarningSeconds: 120,
    capacityUnitId: null,
    capacityLane: null,
    grantedAt: null,
    connectionHost: null,
    connectionPort: null,
    gpuDevice: null,
    checkpointTargetUri: null,
    checkpointUri: null,
    checkpointSizeBytes: null,
    checkpointDurationMs: null,
    releasedAt: null,
    releaseReason: null,
    billableSeconds: 0,
    baselineCostUsd: 0,
    actualCostUsd: 0,
    savingsUsd: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    requestedAt: new Date(),
    ...overrides,
  });

  describe("LeaseStatus", () => {
    it("should have expected statuses", () => {
      expect(LeaseStatus.PENDING).toBe("pending");
      expect(LeaseStatus.ACTIVE).toBe("active");
      expect(LeaseStatus.NEGOTIATING).toBe("negotiating");
      expect(LeaseStatus.CHECKPOINTING).toBe("checkpointing");
      expect(LeaseStatus.CHECKPOINTED).toBe("checkpointed");
      expect(LeaseStatus.RESUMING).toBe("resuming");
      expect(LeaseStatus.COMPLETED).toBe("completed");
      expect(LeaseStatus.LOST).toBe("lost");
    });
  });

  describe("Priority", () => {
    it("should have expected priorities", () => {
      expect(Priority.LOW).toBe("low");
      expect(Priority.NORMAL).toBe("normal");
      expect(Priority.HIGH).toBe("high");
    });
  });

  describe("isLeaseActive", () => {
    it("should return true for active lease", () => {
      const lease = createMockLease({ status: LeaseStatus.ACTIVE });
      expect(isLeaseActive(lease)).toBe(true);
    });

    it("should return true for negotiating lease", () => {
      const lease = createMockLease({ status: LeaseStatus.NEGOTIATING });
      expect(isLeaseActive(lease)).toBe(true);
    });

    it("should return true for checkpointing lease", () => {
      const lease = createMockLease({ status: LeaseStatus.CHECKPOINTING });
      expect(isLeaseActive(lease)).toBe(true);
    });

    it("should return false for pending lease", () => {
      const lease = createMockLease({ status: LeaseStatus.PENDING });
      expect(isLeaseActive(lease)).toBe(false);
    });

    it("should return false for completed lease", () => {
      const lease = createMockLease({ status: LeaseStatus.COMPLETED });
      expect(isLeaseActive(lease)).toBe(false);
    });
  });

  describe("isLeaseTerminal", () => {
    it("should return true for completed lease", () => {
      const lease = createMockLease({ status: LeaseStatus.COMPLETED });
      expect(isLeaseTerminal(lease)).toBe(true);
    });

    it("should return true for lost lease", () => {
      const lease = createMockLease({ status: LeaseStatus.LOST });
      expect(isLeaseTerminal(lease)).toBe(true);
    });

    it("should return false for active lease", () => {
      const lease = createMockLease({ status: LeaseStatus.ACTIVE });
      expect(isLeaseTerminal(lease)).toBe(false);
    });

    it("should return false for pending lease", () => {
      const lease = createMockLease({ status: LeaseStatus.PENDING });
      expect(isLeaseTerminal(lease)).toBe(false);
    });
  });

  describe("calculateLeaseSavings", () => {
    it("should return savings for completed lease", () => {
      const lease = createMockLease({
        baselineCostUsd: 1.0,
        actualCostUsd: 0.85,
      });
      expect(calculateLeaseSavings(lease)).toBeCloseTo(0.15);
    });

    it("should return 0 for zero cost lease", () => {
      const lease = createMockLease({
        baselineCostUsd: 0,
        actualCostUsd: 0,
      });
      expect(calculateLeaseSavings(lease)).toBe(0);
    });
  });
});

describe("Agent Model", () => {
  describe("createAgentCard", () => {
    it("should create agent card with required fields", () => {
      const card = createAgentCard({
        id: "agent_123",
        name: "Test Agent",
        a2aEndpoint: "http://localhost:8080/a2a",
      });

      expect(card.id).toBe("agent_123");
      expect(card.name).toBe("Test Agent");
      expect(card.a2aEndpoint).toBe("http://localhost:8080/a2a");
    });

    it("should set defaults", () => {
      const card = createAgentCard({
        id: "agent_123",
        name: "Test Agent",
        a2aEndpoint: "http://localhost:8080/a2a",
      });

      expect(card.description).toBe("");
      expect(card.supportedTasks).toEqual(["reclaim_request", "status_check"]);
      expect(card.checkpointable).toBe(true);
      expect(card.estimatedCheckpointSizeBytes).toBe(0);
      expect(card.observedCheckpointDurationMs).toBeNull();
      expect(card.trustTier).toBe("external");
    });

    it("should accept optional fields", () => {
      const card = createAgentCard({
        id: "agent_123",
        name: "Test Agent",
        a2aEndpoint: "http://localhost:8080/a2a",
        description: "A test agent",
        supportedTasks: ["custom_task"],
        checkpointable: false,
        trustTier: "internal",
        ownerEmail: "test@example.com",
      });

      expect(card.description).toBe("A test agent");
      expect(card.supportedTasks).toEqual(["custom_task"]);
      expect(card.checkpointable).toBe(false);
      expect(card.trustTier).toBe("internal");
      expect(card.ownerEmail).toBe("test@example.com");
    });

    it("should not include undefined ownerEmail", () => {
      const card = createAgentCard({
        id: "agent_123",
        name: "Test Agent",
        a2aEndpoint: "http://localhost:8080/a2a",
      });

      // ownerEmail should not be defined (not even as undefined)
      expect("ownerEmail" in card).toBe(false);
    });

    it("should set timestamps", () => {
      const before = new Date();
      const card = createAgentCard({
        id: "agent_123",
        name: "Test Agent",
        a2aEndpoint: "http://localhost:8080/a2a",
      });
      const after = new Date();

      expect(card.registeredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(card.registeredAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(card.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });
});
