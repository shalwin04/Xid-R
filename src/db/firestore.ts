/**
 * Firestore client initialization and collection references.
 */

import { Firestore } from "@google-cloud/firestore";
import { getConfig } from "../config.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger({ module: "firestore" });

let db: Firestore | null = null;

/**
 * Initialize Firestore client.
 */
export function initFirestore(): Firestore {
  if (db) return db;

  const config = getConfig();

  db = new Firestore({
    projectId: config.gcp.projectId,
    databaseId: config.gcp.firestoreDatabase,
  });

  logger.info("Firestore initialized", {
    projectId: config.gcp.projectId,
    database: config.gcp.firestoreDatabase,
  });

  return db;
}

/**
 * Get Firestore client (initializes if needed).
 */
export function getFirestore(): Firestore {
  if (!db) {
    return initFirestore();
  }
  return db;
}

/**
 * Collection names.
 */
export const Collections = {
  LEASES: "leases",
  CAPACITY_UNITS: "capacity_units",
  AUDIT_EVENTS: "audit_events",
  AGENT_CARDS: "agent_cards",
  CHECKPOINTS: "checkpoints",
} as const;

/**
 * Get a collection reference.
 */
export function getCollection(name: string) {
  return getFirestore().collection(name);
}

/**
 * Close Firestore connection.
 */
export async function closeFirestore(): Promise<void> {
  if (db) {
    await db.terminate();
    db = null;
    logger.info("Firestore connection closed");
  }
}
