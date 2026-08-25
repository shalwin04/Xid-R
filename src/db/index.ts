/**
 * Database layer for Xid-R.
 *
 * Provides Firestore operations for all collections.
 */

// Core database
export * from "./firestore.js";

// Core collections
export * from "./leases.js";
export * from "./capacity.js";
export * from "./audit.js";
export * from "./agents.js";
export * from "./checkpoints.js";
export * from "./tenants.js";

// Enterprise onboarding
export * from "./organizations.js";
export * from "./cloud-connections.js";
export * from "./onboarding.js";
export * from "./harvesting-rules.js";
