/**
 * Onboarding session database operations.
 */

import { getFirestore } from "./firestore.js";
import { createLogger } from "../utils/logger.js";
import { generateId } from "../utils/ids.js";
import {
  OnboardingSession,
  OnboardingStep,
  OnboardingStepData,
  createNewSession,
  getNextStep,
} from "../models/onboarding.js";

const log = createLogger({ module: "db:onboarding" });

const SESSIONS_COLLECTION = "onboarding_sessions";

// ============================================================================
// Session Operations
// ============================================================================

/**
 * Create a new onboarding session.
 */
export async function createOnboardingSession(email: string): Promise<OnboardingSession> {
  const db = getFirestore();
  const id = generateId("onb");

  const sessionData = createNewSession(email);
  const session: OnboardingSession = {
    id,
    ...sessionData,
  };

  await db.collection(SESSIONS_COLLECTION).doc(id).set({
    ...session,
    startedAt: session.startedAt,
    lastActivityAt: session.lastActivityAt,
  });

  log.info("Created onboarding session", { id, email });
  return session;
}

/**
 * Get onboarding session by ID.
 */
export async function getOnboardingSession(id: string): Promise<OnboardingSession | null> {
  const db = getFirestore();
  const doc = await db.collection(SESSIONS_COLLECTION).doc(id).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    startedAt: data.startedAt?.toDate() || new Date(),
    lastActivityAt: data.lastActivityAt?.toDate() || new Date(),
    completedAt: data.completedAt?.toDate(),
  } as OnboardingSession;
}

/**
 * Get onboarding session by resume token.
 */
export async function getOnboardingSessionByToken(resumeToken: string): Promise<OnboardingSession | null> {
  const db = getFirestore();
  const snapshot = await db
    .collection(SESSIONS_COLLECTION)
    .where("resumeToken", "==", resumeToken)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    startedAt: data.startedAt?.toDate() || new Date(),
    lastActivityAt: data.lastActivityAt?.toDate() || new Date(),
    completedAt: data.completedAt?.toDate(),
  } as OnboardingSession;
}

/**
 * Get onboarding session by email (most recent incomplete).
 * Simplified query to avoid composite index requirement.
 */
export async function getOnboardingSessionByEmail(email: string): Promise<OnboardingSession | null> {
  const db = getFirestore();

  // Simple query by email, then filter in memory
  const snapshot = await db
    .collection(SESSIONS_COLLECTION)
    .where("email", "==", email)
    .get();

  if (snapshot.empty) {
    return null;
  }

  // Filter for incomplete sessions and sort by lastActivityAt
  const incompleteSessions = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        startedAt: data.startedAt?.toDate() || new Date(),
        lastActivityAt: data.lastActivityAt?.toDate() || new Date(),
        completedAt: data.completedAt?.toDate(),
      } as OnboardingSession;
    })
    .filter((session) => !session.completedAt)
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());

  return incompleteSessions[0] || null;
}

/**
 * Update onboarding session.
 */
export async function updateOnboardingSession(
  id: string,
  updates: Partial<Omit<OnboardingSession, "id" | "startedAt" | "resumeToken">>
): Promise<void> {
  const db = getFirestore();

  // Filter out undefined values (Firestore doesn't accept them)
  const cleanedUpdates: Record<string, unknown> = { lastActivityAt: new Date() };
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      cleanedUpdates[key] = value;
    }
  }

  await db.collection(SESSIONS_COLLECTION).doc(id).update(cleanedUpdates);
  log.debug("Updated onboarding session", { id });
}

/**
 * Complete a step and advance to next.
 */
export async function completeOnboardingStep(
  id: string,
  step: OnboardingStep,
  stepData: Partial<OnboardingStepData>
): Promise<{ nextStep: OnboardingStep | null; session: OnboardingSession }> {
  const session = await getOnboardingSession(id);
  if (!session) {
    throw new Error("Session not found");
  }

  // Add step to completed
  const completedSteps = [...session.completedSteps];
  if (!completedSteps.includes(step)) {
    completedSteps.push(step);
  }

  // Merge step data
  const mergedStepData: OnboardingStepData = {
    ...session.stepData,
    ...stepData,
  };

  // Get next step
  const nextStep = getNextStep(step);

  // Prepare updates (note: undefined values are filtered in updateOnboardingSession)
  const updates: Partial<OnboardingSession> = {
    currentStep: nextStep || OnboardingStep.COMPLETE,
    completedSteps,
    stepData: mergedStepData,
    lastActivityAt: new Date(),
    errorCount: 0,
  };

  // Mark as completed if on last step
  if (!nextStep || nextStep === OnboardingStep.COMPLETE) {
    updates.completedAt = new Date();
  }

  await updateOnboardingSession(id, updates);

  const updatedSession = await getOnboardingSession(id);
  log.info("Completed onboarding step", { id, step, nextStep });

  return { nextStep, session: updatedSession! };
}

/**
 * Skip a step and advance to next.
 */
export async function skipOnboardingStep(
  id: string,
  step: OnboardingStep
): Promise<{ nextStep: OnboardingStep | null; session: OnboardingSession }> {
  const session = await getOnboardingSession(id);
  if (!session) {
    throw new Error("Session not found");
  }

  // Add step to skipped
  const skippedSteps = [...session.skippedSteps];
  if (!skippedSteps.includes(step)) {
    skippedSteps.push(step);
  }

  // Get next step
  const nextStep = getNextStep(step);

  await updateOnboardingSession(id, {
    currentStep: nextStep || OnboardingStep.COMPLETE,
    skippedSteps,
    lastActivityAt: new Date(),
  });

  const updatedSession = await getOnboardingSession(id);
  log.info("Skipped onboarding step", { id, step, nextStep });

  return { nextStep, session: updatedSession! };
}

/**
 * Record an error during onboarding.
 */
export async function recordOnboardingError(id: string, error: string): Promise<void> {
  const session = await getOnboardingSession(id);
  if (!session) {
    throw new Error("Session not found");
  }

  await updateOnboardingSession(id, {
    lastError: error,
    errorCount: session.errorCount + 1,
    lastActivityAt: new Date(),
  });

  log.warn("Recorded onboarding error", { id, error, errorCount: session.errorCount + 1 });
}

/**
 * Associate organization with session.
 */
export async function setSessionOrganization(id: string, organizationId: string): Promise<void> {
  await updateOnboardingSession(id, { organizationId });
  log.info("Associated organization with session", { sessionId: id, organizationId });
}

/**
 * Delete onboarding session.
 */
export async function deleteOnboardingSession(id: string): Promise<void> {
  const db = getFirestore();
  await db.collection(SESSIONS_COLLECTION).doc(id).delete();
  log.info("Deleted onboarding session", { id });
}

/**
 * List incomplete sessions older than X days (for cleanup).
 * Simplified query to avoid composite index requirement.
 */
export async function findStaleSessions(staleDays = 7): Promise<OnboardingSession[]> {
  const db = getFirestore();
  const staleThreshold = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  // Simple query, then filter in memory
  const snapshot = await db
    .collection(SESSIONS_COLLECTION)
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        startedAt: data.startedAt?.toDate() || new Date(),
        lastActivityAt: data.lastActivityAt?.toDate() || new Date(),
        completedAt: data.completedAt?.toDate(),
      } as OnboardingSession;
    })
    .filter((session) => !session.completedAt && session.lastActivityAt < staleThreshold);
}

/**
 * Clean up stale sessions.
 */
export async function cleanupStaleSessions(staleDays = 7): Promise<number> {
  const staleSessions = await findStaleSessions(staleDays);

  for (const session of staleSessions) {
    await deleteOnboardingSession(session.id);
  }

  if (staleSessions.length > 0) {
    log.info("Cleaned up stale onboarding sessions", { count: staleSessions.length });
  }

  return staleSessions.length;
}

// ============================================================================
// Analytics
// ============================================================================

/**
 * Get onboarding funnel stats.
 */
export async function getOnboardingFunnelStats(): Promise<{
  totalStarted: number;
  completedByStep: Record<OnboardingStep, number>;
  averageCompletionTimeMinutes: number;
  dropOffRates: Record<OnboardingStep, number>;
}> {
  const db = getFirestore();

  // Get all sessions
  const snapshot = await db.collection(SESSIONS_COLLECTION).get();

  const sessions = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      startedAt: data.startedAt?.toDate() || new Date(),
      lastActivityAt: data.lastActivityAt?.toDate() || new Date(),
      completedAt: data.completedAt?.toDate(),
    } as OnboardingSession;
  });

  const totalStarted = sessions.length;

  // Count completions by step
  const completedByStep: Record<string, number> = {};
  for (const step of Object.values(OnboardingStep)) {
    completedByStep[step] = sessions.filter(
      (s) => s.completedSteps.includes(step) || s.skippedSteps.includes(step)
    ).length;
  }

  // Calculate average completion time
  const completedSessions = sessions.filter((s) => s.completedAt);
  const avgCompletionTime = completedSessions.length > 0
    ? completedSessions.reduce((sum, s) => {
        return sum + (s.completedAt!.getTime() - s.startedAt.getTime());
      }, 0) / completedSessions.length / 1000 / 60
    : 0;

  // Calculate drop-off rates
  const dropOffRates: Record<string, number> = {};
  const steps = Object.values(OnboardingStep);
  for (let i = 0; i < steps.length - 1; i++) {
    const current = completedByStep[steps[i]] || 0;
    const next = completedByStep[steps[i + 1]] || 0;
    dropOffRates[steps[i]] = current > 0 ? ((current - next) / current) * 100 : 0;
  }

  return {
    totalStarted,
    completedByStep: completedByStep as Record<OnboardingStep, number>,
    averageCompletionTimeMinutes: Math.round(avgCompletionTime),
    dropOffRates: dropOffRates as Record<OnboardingStep, number>,
  };
}
