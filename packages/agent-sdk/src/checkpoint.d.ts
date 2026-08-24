/**
 * Checkpoint interface and utilities.
 *
 * Agents implement XidrCheckpointable to support graceful preemption.
 */
import type { CheckpointResult, RestoreResult, CheckpointMetadata } from "./types.js";
/**
 * Interface for agents that support checkpointing.
 *
 * @example
 * ```typescript
 * class MyAgent implements XidrCheckpointable {
 *   private state: MyState = { tasks: [], scratchpad: {} };
 *
 *   async getCheckpointState(): Promise<unknown> {
 *     return this.state;
 *   }
 *
 *   async restoreFromCheckpoint(state: unknown): Promise<void> {
 *     this.state = state as MyState;
 *   }
 *
 *   getStateEstimate(): number {
 *     return JSON.stringify(this.state).length;
 *   }
 * }
 * ```
 */
export interface XidrCheckpointable {
    /**
     * Get the current state to checkpoint.
     * Should return a JSON-serializable object.
     */
    getCheckpointState(): Promise<unknown>;
    /**
     * Restore state from a previous checkpoint.
     */
    restoreFromCheckpoint(state: unknown): Promise<void>;
    /**
     * Get estimated size of checkpoint state in bytes.
     * Used to assess feasibility within grace period.
     */
    getStateEstimate(): number;
}
/**
 * Options for checkpoint operations.
 */
export interface CheckpointOptions {
    /** GCS bucket for checkpoint storage */
    bucket?: string;
    /** Agent type for metadata */
    agentType: string;
    /** Checkpoint version for compatibility */
    version?: string;
}
/**
 * Helper class for checkpoint operations with GCS.
 */
export declare class CheckpointManager {
    private storage;
    private options;
    constructor(options: CheckpointOptions);
    /**
     * Checkpoint an agent's state to GCS.
     *
     * @param agent - The checkpointable agent
     * @param targetUri - GCS URI to write to (gs://bucket/path)
     * @param leaseId - Associated lease ID
     */
    checkpoint(agent: XidrCheckpointable, targetUri: string, leaseId: string): Promise<CheckpointResult>;
    /**
     * Restore an agent's state from a GCS checkpoint.
     *
     * @param agent - The checkpointable agent
     * @param sourceUri - GCS URI to read from
     */
    restore(agent: XidrCheckpointable, sourceUri: string): Promise<RestoreResult>;
    /**
     * Check if a checkpoint exists.
     */
    exists(uri: string): Promise<boolean>;
    /**
     * Get metadata for a checkpoint.
     */
    getMetadata(checkpointUri: string): Promise<CheckpointMetadata | null>;
    /**
     * Delete a checkpoint.
     */
    delete(checkpointUri: string): Promise<void>;
    /**
     * Parse a GCS URI into bucket and path.
     */
    private parseGcsUri;
}
/**
 * Create a simple in-memory checkpoint for testing.
 */
export declare class InMemoryCheckpointManager {
    private checkpoints;
    checkpoint(agent: XidrCheckpointable, targetUri: string, leaseId: string, agentType: string): Promise<CheckpointResult>;
    restore(agent: XidrCheckpointable, sourceUri: string): Promise<RestoreResult>;
    exists(uri: string): boolean;
    getMetadata(uri: string): CheckpointMetadata | null;
    delete(uri: string): void;
    clear(): void;
}
//# sourceMappingURL=checkpoint.d.ts.map