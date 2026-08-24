/**
 * Cooperative Checkpoint SDK
 *
 * Provides the interface and helpers for tenant agents to implement
 * checkpointing for graceful preemption handling.
 */

import { Storage } from "@google-cloud/storage";
import { createLogger } from "../utils/logger.js";
import { CheckpointState, createEmptyCheckpointState } from "../models/checkpoint.js";

const log = createLogger({ module: "checkpoint-sdk" });

/**
 * Result of a checkpoint operation.
 */
export interface CheckpointResult {
  success: boolean;
  uri: string | null;
  sizeBytes: number;
  durationMs: number;
  error: string | null;
}

/**
 * Result of a restore operation.
 */
export interface RestoreResult {
  success: boolean;
  state: CheckpointState | null;
  error: string | null;
}

/**
 * Interface that tenant agents must implement for cooperative checkpointing.
 */
export interface XidrCheckpointable {
  /**
   * Serialize current state to the given GCS URI.
   * Called by Xid-R when capacity is being reclaimed.
   */
  checkpoint(targetUri: string): Promise<CheckpointResult>;

  /**
   * Restore state from a previous checkpoint.
   * Called after agent is resumed on new capacity.
   */
  restore(sourceUri: string): Promise<RestoreResult>;

  /**
   * Return estimated checkpoint size in bytes.
   * Used by Xid-R to assess checkpoint feasibility within grace period.
   */
  getStateSizeEstimate(): number;
}

/**
 * Helper class for checkpoint operations.
 */
export class CheckpointHelper {
  private storage: Storage;
  private agentType: string;

  constructor(agentType: string) {
    this.storage = new Storage();
    this.agentType = agentType;
  }

  /**
   * Parse a GCS URI into bucket and object path.
   */
  parseGcsUri(uri: string): { bucket: string; path: string } {
    const match = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid GCS URI: ${uri}`);
    }
    return { bucket: match[1], path: match[2] };
  }

  /**
   * Upload checkpoint state to GCS.
   */
  async uploadCheckpoint(targetUri: string, state: CheckpointState): Promise<CheckpointResult> {
    const startTime = Date.now();

    try {
      const { bucket, path } = this.parseGcsUri(targetUri);
      const content = JSON.stringify(state, null, 2);
      const sizeBytes = Buffer.byteLength(content, "utf-8");

      const file = this.storage.bucket(bucket).file(path);
      await file.save(content, {
        contentType: "application/json",
        metadata: {
          checkpointVersion: state.checkpointVersion,
          agentType: state.agentType,
          createdAt: state.createdAt,
        },
      });

      const durationMs = Date.now() - startTime;

      log.info("Checkpoint uploaded", {
        uri: targetUri,
        sizeBytes,
        durationMs,
      });

      return {
        success: true,
        uri: targetUri,
        sizeBytes,
        durationMs,
        error: null,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      log.error("Checkpoint upload failed", {
        uri: targetUri,
        error: (error as Error).message,
        durationMs,
      });

      return {
        success: false,
        uri: null,
        sizeBytes: 0,
        durationMs,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Download checkpoint state from GCS.
   */
  async downloadCheckpoint(sourceUri: string): Promise<RestoreResult> {
    try {
      const { bucket, path } = this.parseGcsUri(sourceUri);
      const file = this.storage.bucket(bucket).file(path);

      const [content] = await file.download();
      const state = JSON.parse(content.toString("utf-8")) as CheckpointState;

      log.info("Checkpoint downloaded", {
        uri: sourceUri,
        agentType: state.agentType,
      });

      return {
        success: true,
        state,
        error: null,
      };
    } catch (error) {
      log.error("Checkpoint download failed", {
        uri: sourceUri,
        error: (error as Error).message,
      });

      return {
        success: false,
        state: null,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Create an empty checkpoint state.
   */
  createEmptyState(): CheckpointState {
    return createEmptyCheckpointState(this.agentType);
  }

  /**
   * Estimate size of a state object.
   */
  estimateSize(state: Partial<CheckpointState>): number {
    return Buffer.byteLength(JSON.stringify(state), "utf-8");
  }
}

/**
 * Base class for checkpointable agents.
 */
export abstract class CheckpointableAgent implements XidrCheckpointable {
  protected helper: CheckpointHelper;
  protected state: CheckpointState;

  constructor(agentType: string) {
    this.helper = new CheckpointHelper(agentType);
    this.state = this.helper.createEmptyState();
  }

  /**
   * Checkpoint current state to GCS.
   */
  async checkpoint(targetUri: string): Promise<CheckpointResult> {
    // Update state metadata
    this.state.createdAt = new Date().toISOString();

    // Let subclass prepare state
    await this.prepareCheckpoint();

    // Upload to GCS
    const result = await this.helper.uploadCheckpoint(targetUri, this.state);

    if (result.success) {
      await this.onCheckpointComplete(targetUri);
    }

    return result;
  }

  /**
   * Restore state from GCS.
   */
  async restore(sourceUri: string): Promise<RestoreResult> {
    const result = await this.helper.downloadCheckpoint(sourceUri);

    if (result.success && result.state) {
      this.state = result.state;
      await this.onRestoreComplete(result.state);
    }

    return result;
  }

  /**
   * Get estimated checkpoint size.
   */
  getStateSizeEstimate(): number {
    return this.helper.estimateSize(this.state);
  }

  /**
   * Override to prepare state before checkpoint.
   */
  protected abstract prepareCheckpoint(): Promise<void>;

  /**
   * Override to handle post-checkpoint actions.
   */
  protected abstract onCheckpointComplete(uri: string): Promise<void>;

  /**
   * Override to handle post-restore actions.
   */
  protected abstract onRestoreComplete(state: CheckpointState): Promise<void>;

  // State accessors

  get taskQueue() {
    return this.state.taskQueue;
  }

  set taskQueue(tasks: CheckpointState["taskQueue"]) {
    this.state.taskQueue = tasks;
  }

  get scratchpad() {
    return this.state.scratchpad;
  }

  set scratchpad(data: Record<string, unknown>) {
    this.state.scratchpad = data;
  }

  get conversationHistory() {
    return this.state.conversationHistory;
  }

  addToConversation(role: string, content: string): void {
    this.state.conversationHistory.push({ role, content });

    // Keep only last 100 turns to limit checkpoint size
    if (this.state.conversationHistory.length > 100) {
      this.state.conversationHistory = this.state.conversationHistory.slice(-100);
    }
  }

  get metadata() {
    return this.state.metadata;
  }

  incrementApiCalls(): void {
    this.state.metadata.totalApiCalls++;
  }

  addTokensUsed(tokens: number): void {
    this.state.metadata.tokensUsed += tokens;
  }
}

/**
 * Mock checkpointable for testing without GCS.
 */
export class MockCheckpointHelper extends CheckpointHelper {
  private mockStorage = new Map<string, string>();

  async uploadCheckpoint(targetUri: string, state: CheckpointState): Promise<CheckpointResult> {
    const startTime = Date.now();
    const content = JSON.stringify(state, null, 2);
    const sizeBytes = Buffer.byteLength(content, "utf-8");

    // Simulate some latency
    await new Promise((resolve) => setTimeout(resolve, 50));

    this.mockStorage.set(targetUri, content);

    return {
      success: true,
      uri: targetUri,
      sizeBytes,
      durationMs: Date.now() - startTime,
      error: null,
    };
  }

  async downloadCheckpoint(sourceUri: string): Promise<RestoreResult> {
    const content = this.mockStorage.get(sourceUri);

    if (!content) {
      return {
        success: false,
        state: null,
        error: `Checkpoint not found: ${sourceUri}`,
      };
    }

    return {
      success: true,
      state: JSON.parse(content),
      error: null,
    };
  }
}
