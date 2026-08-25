/**
 * Firestore client initialization and collection references.
 */

import { Firestore } from "@google-cloud/firestore";
import { existsSync } from "fs";
import { resolve } from "path";
import { getConfig } from "../config.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger({ module: "firestore" });

let db: Firestore | null = null;

/**
 * Find service account credentials file.
 * Looks for credentials in order of priority:
 * 1. GOOGLE_APPLICATION_CREDENTIALS env var
 * 2. Service account JSON file in project root
 */
function findCredentialsPath(): string | undefined {
  const config = getConfig();

  // Check if explicitly set in config/env
  if (config.gcp.credentialsPath && existsSync(config.gcp.credentialsPath)) {
    return config.gcp.credentialsPath;
  }

  // Look for service account file in project root
  const possiblePaths = [
    resolve(process.cwd(), "xid-r-development-658e3df43415.json"),
    resolve(process.cwd(), "service-account.json"),
    resolve(process.cwd(), "credentials.json"),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      logger.info("Found credentials file", { path });
      return path;
    }
  }

  return undefined;
}

/**
 * Initialize Firestore client.
 */
export function initFirestore(): Firestore {
  if (db) return db;

  const config = getConfig();
  const credentialsPath = findCredentialsPath();

  const firestoreOptions: ConstructorParameters<typeof Firestore>[0] = {
    projectId: config.gcp.projectId,
    databaseId: config.gcp.firestoreDatabase,
  };

  // Add keyFilename if credentials file found
  if (credentialsPath) {
    firestoreOptions.keyFilename = credentialsPath;
    logger.info("Using service account credentials", { path: credentialsPath });
  }

  db = new Firestore(firestoreOptions);

  logger.info("Firestore initialized", {
    projectId: config.gcp.projectId,
    database: config.gcp.firestoreDatabase,
    hasCredentials: !!credentialsPath,
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
