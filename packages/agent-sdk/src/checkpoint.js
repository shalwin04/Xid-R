/**
 * Checkpoint interface and utilities.
 *
 * Agents implement XidrCheckpointable to support graceful preemption.
 */
import { Storage } from "@google-cloud/storage";
/**
 * Helper class for checkpoint operations with GCS.
 */
export class CheckpointManager {
    storage;
    options;
    constructor(options) {
        this.storage = new Storage();
        this.options = {
            bucket: options.bucket ?? "xidr-checkpoints",
            agentType: options.agentType,
            version: options.version ?? "1.0",
        };
    }
    /**
     * Checkpoint an agent's state to GCS.
     *
     * @param agent - The checkpointable agent
     * @param targetUri - GCS URI to write to (gs://bucket/path)
     * @param leaseId - Associated lease ID
     */
    async checkpoint(agent, targetUri, leaseId) {
        const startTime = Date.now();
        try {
            // Get state from agent
            const state = await agent.getCheckpointState();
            const stateJson = JSON.stringify(state, null, 2);
            const sizeBytes = Buffer.byteLength(stateJson, "utf-8");
            // Create metadata
            const metadata = {
                version: this.options.version,
                agent_type: this.options.agentType,
                created_at: new Date().toISOString(),
                lease_id: leaseId,
                state_size_bytes: sizeBytes,
            };
            // Parse GCS URI
            const { bucket, path } = this.parseGcsUri(targetUri);
            // Upload checkpoint
            const bucketRef = this.storage.bucket(bucket);
            const checkpointBlob = bucketRef.file(`${path}state.json`);
            const metadataBlob = bucketRef.file(`${path}metadata.json`);
            await Promise.all([
                checkpointBlob.save(stateJson, {
                    contentType: "application/json",
                    metadata: {
                        leaseId,
                        agentType: this.options.agentType,
                    },
                }),
                metadataBlob.save(JSON.stringify(metadata, null, 2), {
                    contentType: "application/json",
                }),
            ]);
            const durationMs = Date.now() - startTime;
            return {
                success: true,
                uri: `${targetUri}state.json`,
                size_bytes: sizeBytes,
                duration_ms: durationMs,
            };
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            return {
                success: false,
                size_bytes: 0,
                duration_ms: durationMs,
                error: error.message,
            };
        }
    }
    /**
     * Restore an agent's state from a GCS checkpoint.
     *
     * @param agent - The checkpointable agent
     * @param sourceUri - GCS URI to read from
     */
    async restore(agent, sourceUri) {
        try {
            // Parse GCS URI
            const { bucket, path } = this.parseGcsUri(sourceUri);
            // Download checkpoint
            const bucketRef = this.storage.bucket(bucket);
            const blob = bucketRef.file(path);
            const [contents] = await blob.download();
            const state = JSON.parse(contents.toString("utf-8"));
            // Restore to agent
            await agent.restoreFromCheckpoint(state);
            return {
                success: true,
                state,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
    /**
     * Check if a checkpoint exists.
     */
    async exists(uri) {
        try {
            const { bucket, path } = this.parseGcsUri(uri);
            const bucketRef = this.storage.bucket(bucket);
            const blob = bucketRef.file(path);
            const [exists] = await blob.exists();
            return exists;
        }
        catch {
            return false;
        }
    }
    /**
     * Get metadata for a checkpoint.
     */
    async getMetadata(checkpointUri) {
        try {
            // Replace state.json with metadata.json
            const metadataUri = checkpointUri.replace("state.json", "metadata.json");
            const { bucket, path } = this.parseGcsUri(metadataUri);
            const bucketRef = this.storage.bucket(bucket);
            const blob = bucketRef.file(path);
            const [contents] = await blob.download();
            return JSON.parse(contents.toString("utf-8"));
        }
        catch {
            return null;
        }
    }
    /**
     * Delete a checkpoint.
     */
    async delete(checkpointUri) {
        const { bucket, path } = this.parseGcsUri(checkpointUri);
        const bucketRef = this.storage.bucket(bucket);
        // Delete both state and metadata
        const statePath = path.endsWith("state.json") ? path : `${path}state.json`;
        const metadataPath = statePath.replace("state.json", "metadata.json");
        await Promise.allSettled([
            bucketRef.file(statePath).delete(),
            bucketRef.file(metadataPath).delete(),
        ]);
    }
    /**
     * Parse a GCS URI into bucket and path.
     */
    parseGcsUri(uri) {
        // Handle gs://bucket/path format
        if (uri.startsWith("gs://")) {
            const withoutPrefix = uri.slice(5);
            const slashIndex = withoutPrefix.indexOf("/");
            if (slashIndex === -1) {
                return { bucket: withoutPrefix, path: "" };
            }
            return {
                bucket: withoutPrefix.slice(0, slashIndex),
                path: withoutPrefix.slice(slashIndex + 1),
            };
        }
        // Assume it's just a path in the default bucket
        return {
            bucket: this.options.bucket,
            path: uri,
        };
    }
}
/**
 * Create a simple in-memory checkpoint for testing.
 */
export class InMemoryCheckpointManager {
    checkpoints = new Map();
    async checkpoint(agent, targetUri, leaseId, agentType) {
        const startTime = Date.now();
        try {
            const state = await agent.getCheckpointState();
            const stateJson = JSON.stringify(state);
            const sizeBytes = stateJson.length;
            const metadata = {
                version: "1.0",
                agent_type: agentType,
                created_at: new Date().toISOString(),
                lease_id: leaseId,
                state_size_bytes: sizeBytes,
            };
            this.checkpoints.set(targetUri, { state, metadata });
            return {
                success: true,
                uri: targetUri,
                size_bytes: sizeBytes,
                duration_ms: Date.now() - startTime,
            };
        }
        catch (error) {
            return {
                success: false,
                size_bytes: 0,
                duration_ms: Date.now() - startTime,
                error: error.message,
            };
        }
    }
    async restore(agent, sourceUri) {
        const checkpoint = this.checkpoints.get(sourceUri);
        if (!checkpoint) {
            return { success: false, error: "Checkpoint not found" };
        }
        try {
            await agent.restoreFromCheckpoint(checkpoint.state);
            return { success: true, state: checkpoint.state };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    exists(uri) {
        return this.checkpoints.has(uri);
    }
    getMetadata(uri) {
        return this.checkpoints.get(uri)?.metadata ?? null;
    }
    delete(uri) {
        this.checkpoints.delete(uri);
    }
    clear() {
        this.checkpoints.clear();
    }
}
//# sourceMappingURL=checkpoint.js.map