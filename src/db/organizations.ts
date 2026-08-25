/**
 * Organization database operations.
 */

import { getFirestore } from "./firestore.js";
import { createLogger } from "../utils/logger.js";
import { generateId } from "../utils/ids.js";
import {
  Organization,
  OrganizationMember,
  OrganizationStatus,
  OrganizationPlan,
  DeploymentModel,
  MemberRole,
  MemberStatus,
  AuthProvider,
  createDefaultSettings,
  createDefaultOnboarding,
} from "../models/organization.js";

const log = createLogger({ module: "db:organizations" });

const ORGANIZATIONS_COLLECTION = "organizations";
const MEMBERS_COLLECTION = "organization_members";

// ============================================================================
// Organization CRUD
// ============================================================================

/**
 * Create a new organization.
 */
export async function createOrganization(data: {
  name: string;
  domain?: string;
  billingEmail: string;
  plan?: OrganizationPlan;
  deploymentModel?: DeploymentModel;
}): Promise<Organization> {
  const db = getFirestore();
  const id = generateId("org");

  const org: Organization = {
    id,
    name: data.name,
    domain: data.domain || "",
    status: OrganizationStatus.PENDING_VERIFICATION,
    billingEmail: data.billingEmail,
    plan: data.plan || OrganizationPlan.FREE,
    planStartDate: new Date(),
    deploymentModel: data.deploymentModel || DeploymentModel.SAAS,
    onboarding: createDefaultOnboarding(),
    settings: createDefaultSettings(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Set notification email to billing email by default
  org.settings.notificationEmail = data.billingEmail;

  await db.collection(ORGANIZATIONS_COLLECTION).doc(id).set({
    ...org,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
    planStartDate: org.planStartDate,
  });

  log.info("Created organization", { id, name: data.name });
  return org;
}

/**
 * Get organization by ID.
 */
export async function getOrganization(id: string): Promise<Organization | null> {
  const db = getFirestore();
  const doc = await db.collection(ORGANIZATIONS_COLLECTION).doc(id).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    planStartDate: data.planStartDate?.toDate() || new Date(),
    planEndDate: data.planEndDate?.toDate(),
  } as Organization;
}

/**
 * Get organization by domain.
 */
export async function getOrganizationByDomain(domain: string): Promise<Organization | null> {
  const db = getFirestore();
  const snapshot = await db
    .collection(ORGANIZATIONS_COLLECTION)
    .where("domain", "==", domain)
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
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    planStartDate: data.planStartDate?.toDate() || new Date(),
    planEndDate: data.planEndDate?.toDate(),
  } as Organization;
}

/**
 * Update organization.
 */
export async function updateOrganization(
  id: string,
  updates: Partial<Omit<Organization, "id" | "createdAt">>
): Promise<Organization | null> {
  const db = getFirestore();
  const docRef = db.collection(ORGANIZATIONS_COLLECTION).doc(id);

  const doc = await docRef.get();
  if (!doc.exists) {
    return null;
  }

  const updateData = {
    ...updates,
    updatedAt: new Date(),
  };

  await docRef.update(updateData);

  log.debug("Updated organization", { id, updates: Object.keys(updates) });

  return getOrganization(id);
}

/**
 * Update organization onboarding progress.
 */
export async function updateOnboardingProgress(
  id: string,
  progress: Partial<Organization["onboarding"]>
): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection(ORGANIZATIONS_COLLECTION).doc(id);

  const updates: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(progress)) {
    updates[`onboarding.${key}`] = value;
  }
  updates["updatedAt"] = true;

  await docRef.update({
    ...updates,
    updatedAt: new Date(),
  });

  log.debug("Updated onboarding progress", { id, progress });
}

/**
 * Activate organization (after email verification).
 */
export async function activateOrganization(id: string): Promise<void> {
  await updateOrganization(id, {
    status: OrganizationStatus.ACTIVE,
    onboarding: {
      ...createDefaultOnboarding(),
      emailVerified: true,
    },
  });
  log.info("Activated organization", { id });
}

/**
 * List all organizations.
 */
export async function listOrganizations(options?: {
  status?: OrganizationStatus;
  plan?: OrganizationPlan;
  limit?: number;
}): Promise<Organization[]> {
  const db = getFirestore();
  let query = db.collection(ORGANIZATIONS_COLLECTION).orderBy("createdAt", "desc");

  if (options?.status) {
    query = query.where("status", "==", options.status);
  }
  if (options?.plan) {
    query = query.where("plan", "==", options.plan);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      planStartDate: data.planStartDate?.toDate() || new Date(),
      planEndDate: data.planEndDate?.toDate(),
    } as Organization;
  });
}

// ============================================================================
// Member Operations
// ============================================================================

/**
 * Add member to organization.
 */
export async function addOrganizationMember(data: {
  organizationId: string;
  email: string;
  name: string;
  role?: MemberRole;
  authProvider?: AuthProvider;
  invitedBy?: string;
}): Promise<OrganizationMember> {
  const db = getFirestore();
  const id = generateId("member");

  const member: OrganizationMember = {
    id,
    organizationId: data.organizationId,
    email: data.email,
    name: data.name,
    role: data.role || MemberRole.MEMBER,
    authProvider: data.authProvider || AuthProvider.EMAIL,
    status: MemberStatus.INVITED,
    invitedBy: data.invitedBy,
    invitedAt: new Date(),
    createdAt: new Date(),
  };

  await db.collection(MEMBERS_COLLECTION).doc(id).set({
    ...member,
    invitedAt: member.invitedAt,
    createdAt: member.createdAt,
  });

  log.info("Added organization member", { id, organizationId: data.organizationId, email: data.email });
  return member;
}

/**
 * Get member by ID.
 */
export async function getOrganizationMember(id: string): Promise<OrganizationMember | null> {
  const db = getFirestore();
  const doc = await db.collection(MEMBERS_COLLECTION).doc(id).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    invitedAt: data.invitedAt?.toDate(),
    joinedAt: data.joinedAt?.toDate(),
    lastLoginAt: data.lastLoginAt?.toDate(),
    createdAt: data.createdAt?.toDate() || new Date(),
  } as OrganizationMember;
}

/**
 * Get member by email within organization.
 */
export async function getOrganizationMemberByEmail(
  organizationId: string,
  email: string
): Promise<OrganizationMember | null> {
  const db = getFirestore();
  const snapshot = await db
    .collection(MEMBERS_COLLECTION)
    .where("organizationId", "==", organizationId)
    .where("email", "==", email)
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
    invitedAt: data.invitedAt?.toDate(),
    joinedAt: data.joinedAt?.toDate(),
    lastLoginAt: data.lastLoginAt?.toDate(),
    createdAt: data.createdAt?.toDate() || new Date(),
  } as OrganizationMember;
}

/**
 * List members of an organization.
 */
export async function listOrganizationMembers(
  organizationId: string
): Promise<OrganizationMember[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(MEMBERS_COLLECTION)
    .where("organizationId", "==", organizationId)
    .orderBy("createdAt", "asc")
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      invitedAt: data.invitedAt?.toDate(),
      joinedAt: data.joinedAt?.toDate(),
      lastLoginAt: data.lastLoginAt?.toDate(),
      createdAt: data.createdAt?.toDate() || new Date(),
    } as OrganizationMember;
  });
}

/**
 * Update member.
 */
export async function updateOrganizationMember(
  id: string,
  updates: Partial<Omit<OrganizationMember, "id" | "organizationId" | "createdAt">>
): Promise<void> {
  const db = getFirestore();
  await db.collection(MEMBERS_COLLECTION).doc(id).update(updates);
  log.debug("Updated organization member", { id });
}

/**
 * Activate member (when they accept invite).
 */
export async function activateOrganizationMember(id: string): Promise<void> {
  await updateOrganizationMember(id, {
    status: MemberStatus.ACTIVE,
    joinedAt: new Date(),
  });
  log.info("Activated organization member", { id });
}

/**
 * Record member login.
 */
export async function recordMemberLogin(id: string): Promise<void> {
  await updateOrganizationMember(id, {
    lastLoginAt: new Date(),
  });
}

/**
 * Remove member from organization.
 */
export async function removeOrganizationMember(id: string): Promise<void> {
  const db = getFirestore();
  await db.collection(MEMBERS_COLLECTION).doc(id).delete();
  log.info("Removed organization member", { id });
}
