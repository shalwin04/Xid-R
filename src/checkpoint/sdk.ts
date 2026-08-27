/**
 * Cooperative Checkpoint SDK - Production Ready
 *
 * Provides the interface and helpers for tenant agents to implement
 * checkpointing for graceful preemption handling.
 *
 * Features:
 * - Retry with exponential backoff
 * - Gzip compression for large checkpoints
 * - Schema validation
 * - Progress callbacks
 * - Concurrent operation guards
 * - Artifact streaming for large files
 * - Automatic cleanup
 * - Comprehensive error handling
 */

import { Storage, File } from "@google-cloud/storage";
import { createGzip, createGunzip } from "zlib";
import { pipeline } from "stream/promises";
import { Readable, PassThrough } from "stream";
import { z } from "zod";
import { createLogger } from "../utils/logger.js";
import type { CheckpointState, CheckpointFormat } from "../models/checkpoint.js";
import { createEmptyCheckpointState } from "../models/checkpoint.js";

const log = createLogger({ module: "checkpoint-sdk" });

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Result of a checkpoint operation.
 */
export interface CheckpointResult {
  success: boolean;
  uri: string | null;
  sizeBytes: number;
  compressedSizeBytes: number;
  durationMs: number;
  error: string | null;
  retryCount: number;
}

/**
 * Result of a restore operation.
 */
export interface RestoreResult {
  success: boolean;
  state: CheckpointState | null;
  sizeBytes: number;
  durationMs: number;
  error: string | null;
}

/**
 * Progress callback for long operations.
 */
export type ProgressCallback = (progress: {
  phase: "preparing" | "uploading" | "downloading" | "processing" | "complete";
  bytesProcessed: number;
  totalBytes: number;
  percentComplete: number;
}) => void;

/**
 * Configuration for checkpoint operations.
 */
export interface CheckpointConfig {
  /** Maximum retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  retryBaseDelayMs: number;
  /** Maximum delay between retries in ms (default: 30000) */
  retryMaxDelayMs: number;
  /** Enable gzip compression (default: true) */
  enableCompression: boolean;
  /** Compression threshold in bytes (default: 1024) */
  compressionThresholdBytes: number;
  /** Maximum checkpoint size in bytes (default: 100MB) */
  maxCheckpointSizeBytes: number;
  /** Maximum conversation history entries to keep (default: 100) */
  maxConversationHistory: number;
  /** Checkpoint expiration in ms (default: 24 hours) */
  checkpointExpirationMs: number;
  /** Enable detailed logging (default: false) */
  verboseLogging: boolean;
}

const DEFAULT_CONFIG: CheckpointConfig = {
  maxRetries: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 30000,
  enableCompression: true,
  compressionThresholdBytes: 1024,
  maxCheckpointSizeBytes: 100 * 1024 * 1024, // 100MB
  maxConversationHistory: 100,
  checkpointExpirationMs: 24 * 60 * 60 * 1000, // 24 hours
  verboseLogging: false,
};

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

  /**
   * Check if agent is ready to checkpoint.
   * Returns false if agent is in the middle of a critical operation.
   */
  canCheckpoint(): boolean;
}

// ============================================================================
// Validation Schemas
// ============================================================================

const TaskSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  data: z.record(z.unknown()),
});

const ConversationEntrySchema = z.object({
  role: z.string(),
  content: z.string(),
});

const MetadataSchema = z.object({
  totalApiCalls: z.number(),
  tokensUsed: z.number(),
  elapsedTimeSeconds: z.number(),
});

const CheckpointStateSchema = z.object({
  checkpointVersion: z.string(),
  agentType: z.string(),
  createdAt: z.string(),
  taskQueue: z.array(TaskSchema),
  scratchpad: z.record(z.unknown()),
  conversationHistory: z.array(ConversationEntrySchema),
  artifacts: z.record(z.string()),
  metadata: MetadataSchema,
});

// ============================================================================
// Utilities
// ============================================================================

/**
 * Sleep for the specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay.
 */
function getBackoffDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // Add jitter (0-25% of delay)
  const jitter = delay * 0.25 * Math.random();
  return Math.floor(delay + jitter);
}

/**
 * Check if error is retryable.
 */
function isRetryableError(error: Error): boolean {
  const retryableMessages = [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "socket hang up",
    "network",
    "timeout",
    "503",
    "502",
    "500",
    "rate limit",
  ];

  const message = error.message.toLowerCase();
  return retryableMessages.some((msg) => message.includes(msg.toLowerCase()));
}

/**
 * Compress data using gzip.
 */
async function compressData(data: Buffer): Promise<Buffer<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gzip = createGzip({ level: 6 });
    const input = Readable.from(data);

    input
      .pipe(gzip)
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("end", () => resolve(Buffer.concat(chunks) as Buffer<ArrayBuffer>))
      .on("error", reject);
  });
}

/**
 * Decompress gzip data.
 */
async function decompressData(data: Buffer): Promise<Buffer<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gunzip = createGunzip();
    const input = Readable.from(data);

    input
      .pipe(gunzip)
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("end", () => resolve(Buffer.concat(chunks) as Buffer<ArrayBuffer>))
      .on("error", reject);
  });
}

// ============================================================================
// CheckpointHelper - Production Ready
// ============================================================================

/**
 * Helper class for checkpoint operations with production features.
 */
export class CheckpointHelper {
  private storage: Storage;
  private agentType: string;
  private config: CheckpointConfig;
  private operationLock: boolean = false;

  constructor(agentType: string, config: Partial<CheckpointConfig> = {}) {
    this.storage = new Storage();
    this.agentType = agentType;
    this.config = { ...DEFAULT_CONFIG, ...config };
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
   * Validate checkpoint state against schema.
   */
  validateState(state: unknown): CheckpointState {
    const result = CheckpointStateSchema.safeParse(state);
    if (!result.success) {
      const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      throw new Error(`Invalid checkpoint state: ${errors.join(", ")}`);
    }
    return result.data as CheckpointState;
  }

  /**
   * Check GCS connectivity and permissions.
   */
  async healthCheck(bucketName: string): Promise<{ healthy: boolean; error?: string }> {
    try {
      const bucket = this.storage.bucket(bucketName);
      const [exists] = await bucket.exists();

      if (!exists) {
        return { healthy: false, error: `Bucket ${bucketName} does not exist` };
      }

      // Try to get bucket metadata to verify read permissions
      await bucket.getMetadata();

      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: (error as Error).message };
    }
  }

  /**
   * Upload checkpoint state to GCS with retry and compression.
   */
  async uploadCheckpoint(
    targetUri: string,
    state: CheckpointState,
    onProgress?: ProgressCallback
  ): Promise<CheckpointResult> {
    // Prevent concurrent operations
    if (this.operationLock) {
      return {
        success: false,
        uri: null,
        sizeBytes: 0,
        compressedSizeBytes: 0,
        durationMs: 0,
        error: "Another checkpoint operation is in progress",
        retryCount: 0,
      };
    }

    this.operationLock = true;
    const startTime = Date.now();
    let retryCount = 0;

    try {
      // Validate state
      this.validateState(state);

      // Prepare content
      onProgress?.({
        phase: "preparing",
        bytesProcessed: 0,
        totalBytes: 0,
        percentComplete: 0,
      });

      const content = JSON.stringify(state, null, 2);
      const originalSize = Buffer.byteLength(content, "utf-8");

      // Check size limit
      if (originalSize > this.config.maxCheckpointSizeBytes) {
        throw new Error(
          `Checkpoint size (${originalSize} bytes) exceeds maximum (${this.config.maxCheckpointSizeBytes} bytes)`
        );
      }

      // Compress if enabled and above threshold
      let uploadData = Buffer.from(content, "utf-8");
      let isCompressed = false;

      if (
        this.config.enableCompression &&
        originalSize > this.config.compressionThresholdBytes
      ) {
        uploadData = await compressData(uploadData);
        isCompressed = true;

        if (this.config.verboseLogging) {
          log.debug("Checkpoint compressed", {
            originalSize,
            compressedSize: uploadData.length,
            ratio: ((1 - uploadData.length / originalSize) * 100).toFixed(1) + "%",
          });
        }
      }

      const compressedSize = uploadData.length;

      // Parse URI and get file reference
      const { bucket, path } = this.parseGcsUri(targetUri);
      const file = this.storage.bucket(bucket).file(path);

      // Upload with retry
      while (retryCount <= this.config.maxRetries) {
        try {
          onProgress?.({
            phase: "uploading",
            bytesProcessed: 0,
            totalBytes: compressedSize,
            percentComplete: 0,
          });

          await file.save(uploadData, {
            contentType: isCompressed ? "application/gzip" : "application/json",
            metadata: {
              checkpointVersion: state.checkpointVersion,
              agentType: state.agentType,
              createdAt: state.createdAt,
              originalSize: originalSize.toString(),
              compressed: isCompressed.toString(),
              expiresAt: new Date(
                Date.now() + this.config.checkpointExpirationMs
              ).toISOString(),
            },
            resumable: compressedSize > 5 * 1024 * 1024, // Use resumable for >5MB
          });

          onProgress?.({
            phase: "complete",
            bytesProcessed: compressedSize,
            totalBytes: compressedSize,
            percentComplete: 100,
          });

          const durationMs = Date.now() - startTime;

          log.info("Checkpoint uploaded", {
            uri: targetUri,
            originalSize,
            compressedSize,
            compressed: isCompressed,
            durationMs,
            retryCount,
          });

          return {
            success: true,
            uri: targetUri,
            sizeBytes: originalSize,
            compressedSizeBytes: compressedSize,
            durationMs,
            error: null,
            retryCount,
          };
        } catch (uploadError) {
          const err = uploadError as Error;

          if (retryCount < this.config.maxRetries && isRetryableError(err)) {
            retryCount++;
            const delay = getBackoffDelay(
              retryCount,
              this.config.retryBaseDelayMs,
              this.config.retryMaxDelayMs
            );

            log.warn("Checkpoint upload failed, retrying", {
              uri: targetUri,
              error: err.message,
              retryCount,
              delayMs: delay,
            });

            await sleep(delay);
          } else {
            throw err;
          }
        }
      }

      // Should not reach here, but handle it
      throw new Error("Max retries exceeded");
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const err = error as Error;

      log.error("Checkpoint upload failed", {
        uri: targetUri,
        error: err.message,
        durationMs,
        retryCount,
      });

      return {
        success: false,
        uri: null,
        sizeBytes: 0,
        compressedSizeBytes: 0,
        durationMs,
        error: err.message,
        retryCount,
      };
    } finally {
      this.operationLock = false;
    }
  }

  /**
   * Download checkpoint state from GCS with retry and decompression.
   */
  async downloadCheckpoint(
    sourceUri: string,
    onProgress?: ProgressCallback
  ): Promise<RestoreResult> {
    // Prevent concurrent operations
    if (this.operationLock) {
      return {
        success: false,
        state: null,
        sizeBytes: 0,
        durationMs: 0,
        error: "Another checkpoint operation is in progress",
      };
    }

    this.operationLock = true;
    const startTime = Date.now();
    let retryCount = 0;

    try {
      const { bucket, path } = this.parseGcsUri(sourceUri);
      const file = this.storage.bucket(bucket).file(path);

      // Download with retry
      let downloadedData: Buffer | null = null;

      while (retryCount <= this.config.maxRetries) {
        try {
          onProgress?.({
            phase: "downloading",
            bytesProcessed: 0,
            totalBytes: 0,
            percentComplete: 0,
          });

          // Get metadata first
          const [metadata] = await file.getMetadata();
          const isCompressed = metadata.metadata?.compressed === "true";
          const expectedSize = parseInt(metadata.size as string, 10);

          // Check expiration
          const expiresAtValue = metadata.metadata?.expiresAt;
          if (expiresAtValue && typeof expiresAtValue === "string") {
            const expiresAt = new Date(expiresAtValue);
            if (expiresAt < new Date()) {
              throw new Error("Checkpoint has expired");
            }
          }

          // Download content
          const [content] = await file.download();
          downloadedData = content;

          onProgress?.({
            phase: "processing",
            bytesProcessed: expectedSize,
            totalBytes: expectedSize,
            percentComplete: 80,
          });

          // Decompress if needed
          let jsonContent: string;
          if (isCompressed) {
            const decompressed = await decompressData(content);
            jsonContent = decompressed.toString("utf-8");

            if (this.config.verboseLogging) {
              log.debug("Checkpoint decompressed", {
                compressedSize: content.length,
                originalSize: decompressed.length,
              });
            }
          } else {
            jsonContent = content.toString("utf-8");
          }

          // Parse and validate
          const rawState = JSON.parse(jsonContent);
          const state = this.validateState(rawState);

          onProgress?.({
            phase: "complete",
            bytesProcessed: expectedSize,
            totalBytes: expectedSize,
            percentComplete: 100,
          });

          const durationMs = Date.now() - startTime;

          log.info("Checkpoint downloaded", {
            uri: sourceUri,
            sizeBytes: content.length,
            agentType: state.agentType,
            durationMs,
          });

          return {
            success: true,
            state,
            sizeBytes: content.length,
            durationMs,
            error: null,
          };
        } catch (downloadError) {
          const err = downloadError as Error;

          if (retryCount < this.config.maxRetries && isRetryableError(err)) {
            retryCount++;
            const delay = getBackoffDelay(
              retryCount,
              this.config.retryBaseDelayMs,
              this.config.retryMaxDelayMs
            );

            log.warn("Checkpoint download failed, retrying", {
              uri: sourceUri,
              error: err.message,
              retryCount,
              delayMs: delay,
            });

            await sleep(delay);
          } else {
            throw err;
          }
        }
      }

      throw new Error("Max retries exceeded");
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const err = error as Error;

      log.error("Checkpoint download failed", {
        uri: sourceUri,
        error: err.message,
        durationMs,
      });

      return {
        success: false,
        state: null,
        sizeBytes: 0,
        durationMs,
        error: err.message,
      };
    } finally {
      this.operationLock = false;
    }
  }

  /**
   * Upload a large binary artifact separately.
   */
  async uploadArtifact(
    baseUri: string,
    artifactId: string,
    data: Buffer,
    contentType: string = "application/octet-stream"
  ): Promise<{ success: boolean; uri: string | null; error: string | null }> {
    try {
      const { bucket, path } = this.parseGcsUri(baseUri);
      const artifactPath = `${path.replace(/\/$/, "")}/artifacts/${artifactId}`;
      const file = this.storage.bucket(bucket).file(artifactPath);

      await file.save(data, {
        contentType,
        resumable: data.length > 5 * 1024 * 1024,
      });

      const uri = `gs://${bucket}/${artifactPath}`;
      log.info("Artifact uploaded", { uri, sizeBytes: data.length });

      return { success: true, uri, error: null };
    } catch (error) {
      const err = error as Error;
      log.error("Artifact upload failed", { error: err.message });
      return { success: false, uri: null, error: err.message };
    }
  }

  /**
   * Download a binary artifact.
   */
  async downloadArtifact(
    artifactUri: string
  ): Promise<{ success: boolean; data: Buffer | null; error: string | null }> {
    try {
      const { bucket, path } = this.parseGcsUri(artifactUri);
      const file = this.storage.bucket(bucket).file(path);

      const [content] = await file.download();
      log.info("Artifact downloaded", { uri: artifactUri, sizeBytes: content.length });

      return { success: true, data: content, error: null };
    } catch (error) {
      const err = error as Error;
      log.error("Artifact download failed", { error: err.message });
      return { success: false, data: null, error: err.message };
    }
  }

  /**
   * Delete a checkpoint and its artifacts.
   */
  async deleteCheckpoint(checkpointUri: string): Promise<boolean> {
    try {
      const { bucket, path } = this.parseGcsUri(checkpointUri);

      // Delete main checkpoint
      await this.storage.bucket(bucket).file(path).delete({ ignoreNotFound: true });

      // Delete artifacts folder
      const artifactsPrefix = `${path.replace(/\/$/, "")}/artifacts/`;
      const [files] = await this.storage.bucket(bucket).getFiles({ prefix: artifactsPrefix });

      for (const file of files) {
        await file.delete({ ignoreNotFound: true });
      }

      log.info("Checkpoint deleted", { uri: checkpointUri, artifactsDeleted: files.length });
      return true;
    } catch (error) {
      log.error("Checkpoint deletion failed", { error: (error as Error).message });
      return false;
    }
  }

  /**
   * List checkpoints for an agent.
   */
  async listCheckpoints(
    bucketName: string,
    agentId: string,
    limit: number = 10
  ): Promise<Array<{ uri: string; createdAt: string; sizeBytes: number }>> {
    try {
      const prefix = `checkpoints/${agentId}/`;
      const [files] = await this.storage.bucket(bucketName).getFiles({
        prefix,
        maxResults: limit,
      });

      const checkpoints = await Promise.all(
        files
          .filter((f) => !f.name.includes("/artifacts/"))
          .map(async (file) => {
            const [metadata] = await file.getMetadata();
            const createdAtValue = metadata.metadata?.createdAt;
            const createdAt = typeof createdAtValue === "string"
              ? createdAtValue
              : (metadata.timeCreated as string) ?? new Date().toISOString();
            return {
              uri: `gs://${bucketName}/${file.name}`,
              createdAt,
              sizeBytes: parseInt(metadata.size as string, 10),
            };
          })
      );

      return checkpoints.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      log.error("List checkpoints failed", { error: (error as Error).message });
      return [];
    }
  }

  /**
   * Clean up expired checkpoints.
   */
  async cleanupExpiredCheckpoints(bucketName: string, agentId?: string): Promise<number> {
    try {
      const prefix = agentId ? `checkpoints/${agentId}/` : "checkpoints/";
      const [files] = await this.storage.bucket(bucketName).getFiles({ prefix });

      let deletedCount = 0;
      const now = new Date();

      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const expiresAtValue = metadata.metadata?.expiresAt;

        if (expiresAtValue && typeof expiresAtValue === "string") {
          const expiresAt = new Date(expiresAtValue);
          if (expiresAt < now) {
            await file.delete({ ignoreNotFound: true });
            deletedCount++;
          }
        }
      }

      if (deletedCount > 0) {
        log.info("Expired checkpoints cleaned up", { deletedCount, bucket: bucketName });
      }

      return deletedCount;
    } catch (error) {
      log.error("Checkpoint cleanup failed", { error: (error as Error).message });
      return 0;
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

  /**
   * Get configuration.
   */
  getConfig(): CheckpointConfig {
    return { ...this.config };
  }

  /**
   * Check if an operation is in progress.
   */
  isOperationInProgress(): boolean {
    return this.operationLock;
  }
}

// ============================================================================
// CheckpointableAgent - Base Class
// ============================================================================

/**
 * Base class for checkpointable agents with production features.
 */
export abstract class CheckpointableAgent implements XidrCheckpointable {
  protected helper: CheckpointHelper;
  protected state: CheckpointState;
  protected startTime: number;
  protected checkpointInProgress: boolean = false;
  protected lastCheckpointUri: string | null = null;

  constructor(agentType: string, config: Partial<CheckpointConfig> = {}) {
    this.helper = new CheckpointHelper(agentType, config);
    this.state = this.helper.createEmptyState();
    this.startTime = Date.now();
  }

  /**
   * Check if agent can checkpoint (override to add custom logic).
   */
  canCheckpoint(): boolean {
    return !this.checkpointInProgress;
  }

  /**
   * Checkpoint current state to GCS.
   */
  async checkpoint(
    targetUri: string,
    onProgress?: ProgressCallback
  ): Promise<CheckpointResult> {
    if (!this.canCheckpoint()) {
      return {
        success: false,
        uri: null,
        sizeBytes: 0,
        compressedSizeBytes: 0,
        durationMs: 0,
        error: "Agent is not ready to checkpoint",
        retryCount: 0,
      };
    }

    this.checkpointInProgress = true;

    try {
      // Update state metadata
      this.state.createdAt = new Date().toISOString();
      this.state.metadata.elapsedTimeSeconds = Math.floor(
        (Date.now() - this.startTime) / 1000
      );

      // Truncate conversation history if needed
      const maxHistory = this.helper.getConfig().maxConversationHistory;
      if (this.state.conversationHistory.length > maxHistory) {
        this.state.conversationHistory = this.state.conversationHistory.slice(-maxHistory);
      }

      // Let subclass prepare state
      await this.prepareCheckpoint();

      // Upload to GCS
      const result = await this.helper.uploadCheckpoint(targetUri, this.state, onProgress);

      if (result.success) {
        this.lastCheckpointUri = targetUri;
        await this.onCheckpointComplete(targetUri);
      }

      return result;
    } finally {
      this.checkpointInProgress = false;
    }
  }

  /**
   * Restore state from GCS.
   */
  async restore(
    sourceUri: string,
    onProgress?: ProgressCallback
  ): Promise<RestoreResult> {
    const result = await this.helper.downloadCheckpoint(sourceUri, onProgress);

    if (result.success && result.state) {
      this.state = result.state;
      this.lastCheckpointUri = sourceUri;
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
   * Get last checkpoint URI.
   */
  getLastCheckpointUri(): string | null {
    return this.lastCheckpointUri;
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

  // =========================================================================
  // State Accessors
  // =========================================================================

  get taskQueue() {
    return this.state.taskQueue;
  }

  set taskQueue(tasks: CheckpointState["taskQueue"]) {
    this.state.taskQueue = tasks;
  }

  addTask(task: CheckpointState["taskQueue"][0]): void {
    this.state.taskQueue.push(task);
  }

  removeTask(taskId: string): void {
    this.state.taskQueue = this.state.taskQueue.filter((t) => t.id !== taskId);
  }

  updateTaskStatus(taskId: string, status: string): void {
    const task = this.state.taskQueue.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
    }
  }

  get scratchpad() {
    return this.state.scratchpad;
  }

  set scratchpad(data: Record<string, unknown>) {
    this.state.scratchpad = data;
  }

  setScratchpadValue(key: string, value: unknown): void {
    this.state.scratchpad[key] = value;
  }

  getScratchpadValue<T>(key: string): T | undefined {
    return this.state.scratchpad[key] as T | undefined;
  }

  get conversationHistory() {
    return this.state.conversationHistory;
  }

  addToConversation(role: string, content: string): void {
    this.state.conversationHistory.push({ role, content });
  }

  clearConversation(): void {
    this.state.conversationHistory = [];
  }

  get artifacts() {
    return this.state.artifacts;
  }

  setArtifact(id: string, uri: string): void {
    this.state.artifacts[id] = uri;
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

  get rawState(): CheckpointState {
    return { ...this.state };
  }
}

// ============================================================================
// MockCheckpointHelper - For Testing
// ============================================================================

/**
 * Mock checkpointable helper for testing without GCS.
 */
export class MockCheckpointHelper extends CheckpointHelper {
  private mockStorage = new Map<string, { content: string; metadata: Record<string, string> }>();
  private simulatedLatencyMs: number;
  private simulateFailures: boolean;
  private failureRate: number;

  constructor(
    agentType: string,
    options: {
      simulatedLatencyMs?: number;
      simulateFailures?: boolean;
      failureRate?: number;
    } = {}
  ) {
    super(agentType);
    this.simulatedLatencyMs = options.simulatedLatencyMs ?? 50;
    this.simulateFailures = options.simulateFailures ?? false;
    this.failureRate = options.failureRate ?? 0.1;
  }

  async uploadCheckpoint(
    targetUri: string,
    state: CheckpointState,
    onProgress?: ProgressCallback
  ): Promise<CheckpointResult> {
    const startTime = Date.now();

    // Simulate network latency
    await sleep(this.simulatedLatencyMs);

    // Simulate random failures
    if (this.simulateFailures && Math.random() < this.failureRate) {
      return {
        success: false,
        uri: null,
        sizeBytes: 0,
        compressedSizeBytes: 0,
        durationMs: Date.now() - startTime,
        error: "Simulated upload failure",
        retryCount: 0,
      };
    }

    onProgress?.({
      phase: "preparing",
      bytesProcessed: 0,
      totalBytes: 0,
      percentComplete: 0,
    });

    const content = JSON.stringify(state, null, 2);
    const sizeBytes = Buffer.byteLength(content, "utf-8");

    onProgress?.({
      phase: "uploading",
      bytesProcessed: sizeBytes,
      totalBytes: sizeBytes,
      percentComplete: 50,
    });

    this.mockStorage.set(targetUri, {
      content,
      metadata: {
        checkpointVersion: state.checkpointVersion,
        agentType: state.agentType,
        createdAt: state.createdAt,
        compressed: "false",
      },
    });

    onProgress?.({
      phase: "complete",
      bytesProcessed: sizeBytes,
      totalBytes: sizeBytes,
      percentComplete: 100,
    });

    return {
      success: true,
      uri: targetUri,
      sizeBytes,
      compressedSizeBytes: sizeBytes,
      durationMs: Date.now() - startTime,
      error: null,
      retryCount: 0,
    };
  }

  async downloadCheckpoint(
    sourceUri: string,
    onProgress?: ProgressCallback
  ): Promise<RestoreResult> {
    const startTime = Date.now();

    // Simulate network latency
    await sleep(this.simulatedLatencyMs);

    // Simulate random failures
    if (this.simulateFailures && Math.random() < this.failureRate) {
      return {
        success: false,
        state: null,
        sizeBytes: 0,
        durationMs: Date.now() - startTime,
        error: "Simulated download failure",
      };
    }

    const stored = this.mockStorage.get(sourceUri);

    if (!stored) {
      return {
        success: false,
        state: null,
        sizeBytes: 0,
        durationMs: Date.now() - startTime,
        error: `Checkpoint not found: ${sourceUri}`,
      };
    }

    onProgress?.({
      phase: "downloading",
      bytesProcessed: stored.content.length,
      totalBytes: stored.content.length,
      percentComplete: 100,
    });

    return {
      success: true,
      state: JSON.parse(stored.content),
      sizeBytes: stored.content.length,
      durationMs: Date.now() - startTime,
      error: null,
    };
  }

  async healthCheck(bucketName: string): Promise<{ healthy: boolean; error?: string }> {
    return { healthy: true };
  }

  /**
   * Get all stored checkpoints (for testing).
   */
  getAllCheckpoints(): Map<string, { content: string; metadata: Record<string, string> }> {
    return new Map(this.mockStorage);
  }

  /**
   * Clear all stored checkpoints (for testing).
   */
  clearAll(): void {
    this.mockStorage.clear();
  }
}

// ============================================================================
// Exports
// ============================================================================

export type { CheckpointState, CheckpointFormat };
