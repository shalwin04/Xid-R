/**
 * Checkpoint SDK Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CheckpointHelper,
  MockCheckpointHelper,
  CheckpointableAgent,
  createEmptyCheckpointState,
} from "../src/checkpoint/index.js";
import type { CheckpointState, CheckpointConfig } from "../src/checkpoint/index.js";

describe("CheckpointHelper", () => {
  describe("parseGcsUri", () => {
    it("should parse valid GCS URIs", () => {
      const helper = new MockCheckpointHelper("test-agent");

      const result = helper.parseGcsUri("gs://my-bucket/path/to/file.json");

      expect(result.bucket).toBe("my-bucket");
      expect(result.path).toBe("path/to/file.json");
    });

    it("should throw on invalid GCS URIs", () => {
      const helper = new MockCheckpointHelper("test-agent");

      expect(() => helper.parseGcsUri("invalid-uri")).toThrow("Invalid GCS URI");
      expect(() => helper.parseGcsUri("s3://bucket/file")).toThrow("Invalid GCS URI");
    });
  });

  describe("estimateSize", () => {
    it("should estimate state size correctly", () => {
      const helper = new MockCheckpointHelper("test-agent");
      const state = createEmptyCheckpointState("test-agent");
      state.scratchpad = { key: "value".repeat(100) };

      const size = helper.estimateSize(state);

      expect(size).toBeGreaterThan(0);
      expect(size).toBeGreaterThan(JSON.stringify({ scratchpad: {} }).length);
    });
  });

  describe("createEmptyState", () => {
    it("should create valid empty state", () => {
      const helper = new MockCheckpointHelper("test-agent");
      const state = helper.createEmptyState();

      expect(state.agentType).toBe("test-agent");
      expect(state.checkpointVersion).toBe("1.0");
      expect(state.taskQueue).toEqual([]);
      expect(state.scratchpad).toEqual({});
      expect(state.conversationHistory).toEqual([]);
      expect(state.artifacts).toEqual({});
      expect(state.metadata.totalApiCalls).toBe(0);
      expect(state.metadata.tokensUsed).toBe(0);
    });
  });
});

describe("MockCheckpointHelper", () => {
  let helper: MockCheckpointHelper;

  beforeEach(() => {
    helper = new MockCheckpointHelper("test-agent", {
      simulatedLatencyMs: 10,
      simulateFailures: false,
    });
    helper.clearAll();
  });

  describe("uploadCheckpoint", () => {
    it("should upload checkpoint successfully", async () => {
      const state = createEmptyCheckpointState("test-agent");
      state.scratchpad = { test: "data" };

      const result = await helper.uploadCheckpoint(
        "gs://test-bucket/checkpoint.json",
        state
      );

      expect(result.success).toBe(true);
      expect(result.uri).toBe("gs://test-bucket/checkpoint.json");
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.error).toBeNull();
    });

    it("should store checkpoint in mock storage", async () => {
      const state = createEmptyCheckpointState("test-agent");

      await helper.uploadCheckpoint("gs://test-bucket/checkpoint.json", state);

      const stored = helper.getAllCheckpoints();
      expect(stored.has("gs://test-bucket/checkpoint.json")).toBe(true);
    });

    it("should call progress callback", async () => {
      const state = createEmptyCheckpointState("test-agent");
      const progressCalls: string[] = [];

      await helper.uploadCheckpoint(
        "gs://test-bucket/checkpoint.json",
        state,
        (progress) => progressCalls.push(progress.phase)
      );

      expect(progressCalls).toContain("preparing");
      expect(progressCalls).toContain("uploading");
      expect(progressCalls).toContain("complete");
    });
  });

  describe("downloadCheckpoint", () => {
    it("should download uploaded checkpoint", async () => {
      const state = createEmptyCheckpointState("test-agent");
      state.scratchpad = { key: "value" };

      await helper.uploadCheckpoint("gs://test-bucket/checkpoint.json", state);
      const result = await helper.downloadCheckpoint("gs://test-bucket/checkpoint.json");

      expect(result.success).toBe(true);
      expect(result.state).not.toBeNull();
      expect(result.state?.agentType).toBe("test-agent");
      expect(result.state?.scratchpad).toEqual({ key: "value" });
    });

    it("should return error for non-existent checkpoint", async () => {
      const result = await helper.downloadCheckpoint("gs://test-bucket/nonexistent.json");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("with simulated failures", () => {
    it("should simulate random failures", async () => {
      const failingHelper = new MockCheckpointHelper("test-agent", {
        simulatedLatencyMs: 1,
        simulateFailures: true,
        failureRate: 1.0, // 100% failure rate
      });

      const state = createEmptyCheckpointState("test-agent");
      const result = await failingHelper.uploadCheckpoint(
        "gs://test-bucket/checkpoint.json",
        state
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Simulated");
    });
  });

  describe("healthCheck", () => {
    it("should return healthy", async () => {
      const result = await helper.healthCheck("any-bucket");
      expect(result.healthy).toBe(true);
    });
  });
});

describe("createEmptyCheckpointState", () => {
  it("should create state with correct structure", () => {
    const state = createEmptyCheckpointState("my-agent");

    expect(state).toMatchObject({
      checkpointVersion: "1.0",
      agentType: "my-agent",
      taskQueue: [],
      scratchpad: {},
      conversationHistory: [],
      artifacts: {},
      metadata: {
        totalApiCalls: 0,
        tokensUsed: 0,
        elapsedTimeSeconds: 0,
      },
    });
    expect(state.createdAt).toBeDefined();
  });
});

// Test a concrete implementation of CheckpointableAgent
class TestAgent extends CheckpointableAgent {
  public testData: string = "";

  protected async prepareCheckpoint(): Promise<void> {
    this.setScratchpadValue("testData", this.testData);
  }

  protected async onCheckpointComplete(uri: string): Promise<void> {
    // No-op for test
  }

  protected async onRestoreComplete(state: CheckpointState): Promise<void> {
    this.testData = this.getScratchpadValue("testData") ?? "";
  }
}

describe("CheckpointableAgent", () => {
  let agent: TestAgent;

  beforeEach(() => {
    agent = new TestAgent("test-agent", {
      maxRetries: 1,
      enableCompression: false,
    });
  });

  describe("task management", () => {
    it("should add tasks", () => {
      agent.addTask({
        id: "task-1",
        type: "test",
        status: "pending",
        data: { key: "value" },
      });

      expect(agent.taskQueue).toHaveLength(1);
      expect(agent.taskQueue[0].id).toBe("task-1");
    });

    it("should update task status", () => {
      agent.addTask({
        id: "task-1",
        type: "test",
        status: "pending",
        data: {},
      });

      agent.updateTaskStatus("task-1", "completed");

      expect(agent.taskQueue[0].status).toBe("completed");
    });

    it("should remove tasks", () => {
      agent.addTask({ id: "task-1", type: "test", status: "pending", data: {} });
      agent.addTask({ id: "task-2", type: "test", status: "pending", data: {} });

      agent.removeTask("task-1");

      expect(agent.taskQueue).toHaveLength(1);
      expect(agent.taskQueue[0].id).toBe("task-2");
    });
  });

  describe("scratchpad", () => {
    it("should set and get values", () => {
      agent.setScratchpadValue("key", { nested: "value" });

      const value = agent.getScratchpadValue<{ nested: string }>("key");

      expect(value).toEqual({ nested: "value" });
    });

    it("should return undefined for missing keys", () => {
      const value = agent.getScratchpadValue("nonexistent");
      expect(value).toBeUndefined();
    });
  });

  describe("conversation history", () => {
    it("should add conversation entries", () => {
      agent.addToConversation("user", "Hello");
      agent.addToConversation("assistant", "Hi there!");

      expect(agent.conversationHistory).toHaveLength(2);
      expect(agent.conversationHistory[0]).toEqual({ role: "user", content: "Hello" });
    });

    it("should clear conversation", () => {
      agent.addToConversation("user", "Hello");
      agent.clearConversation();

      expect(agent.conversationHistory).toHaveLength(0);
    });
  });

  describe("metadata", () => {
    it("should increment API calls", () => {
      agent.incrementApiCalls();
      agent.incrementApiCalls();

      expect(agent.metadata.totalApiCalls).toBe(2);
    });

    it("should add tokens used", () => {
      agent.addTokensUsed(100);
      agent.addTokensUsed(50);

      expect(agent.metadata.tokensUsed).toBe(150);
    });
  });

  describe("canCheckpoint", () => {
    it("should return true when not checkpointing", () => {
      expect(agent.canCheckpoint()).toBe(true);
    });
  });

  describe("getStateSizeEstimate", () => {
    it("should return positive size", () => {
      agent.setScratchpadValue("data", "x".repeat(1000));

      const size = agent.getStateSizeEstimate();

      expect(size).toBeGreaterThan(1000);
    });
  });

  describe("artifacts", () => {
    it("should set artifact references", () => {
      agent.setArtifact("report", "gs://bucket/report.pdf");

      expect(agent.artifacts.report).toBe("gs://bucket/report.pdf");
    });
  });

  describe("rawState", () => {
    it("should return copy of state", () => {
      agent.setScratchpadValue("key", "value");
      const state1 = agent.rawState;
      const state2 = agent.rawState;

      // Should be equal but not same reference
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });
  });
});
