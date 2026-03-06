import { getAdminAuth } from "@/lib/firebase-admin";
import { loadActiveAdminAllowlistByEmail } from "@/lib/admin-db";
import { readAdminSessionFromRequestCookie } from "@/lib/admin-auth";
import type { AccountStatus, AdminRole } from "@/types/admin";

const readBearerToken = (request: Request): string | null => {
  const authorization = request.headers.get("authorization")?.trim() || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token || null;
};

export type ServerAuthContext = {
  uid: string;
  email: string | null;
  isAdminClaim: boolean;
  isAllowlistedAdmin: boolean;
  adminRole: AdminRole | null;
  accountStatus: AccountStatus;
};

export const getServerAuthContext = async (request: Request): Promise<ServerAuthContext> => {
  const token = readBearerToken(request);
  if (!token) {
    throw new Error("Missing bearer token.");
  }

  const auth = await getAdminAuth();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;
  const email = typeof decoded.email === "string" ? decoded.email.trim().toLowerCase() : null;
  const isAdminClaim = decoded.admin === true;

  const allowlist = email ? await loadActiveAdminAllowlistByEmail(email).catch(() => null) : null;
  const isAllowlistedAdmin = Boolean(allowlist?.active);
  const adminRole: AdminRole | null = allowlist?.role ?? null;

  // Use the members document as the canonical source for account moderation status.
  // Missing docs default to active so existing accounts do not break.
  let accountStatus: AccountStatus = "active";
  try {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const db = await getAdminDb();
    const memberSnapshot = await db.collection("members").doc(uid).get();
    const rawStatus = memberSnapshot.data()?.accountStatus;
    accountStatus = rawStatus === "suspended" ? "suspended" : "active";
  } catch {
    accountStatus = "active";
  }

  return {
    uid,
    email,
    isAdminClaim,
    isAllowlistedAdmin,
    adminRole,
    accountStatus,
  };
};

export const getAuthenticatedUid = async (request: Request): Promise<string> => {
  const context = await getServerAuthContext(request);
  return context.uid;
};

export const assertUserCanWrite = async (request: Request): Promise<ServerAuthContext> => {
  const context = await getServerAuthContext(request);
  if (context.accountStatus === "suspended") {
    throw new Error("Account is suspended from write actions.");
  }
  return context;
};

export const assertAdminAccess = async (request: Request): Promise<ServerAuthContext> => {
  try {
    const context = await getServerAuthContext(request);
    if (!context.isAllowlistedAdmin || !context.adminRole || !context.email) {
      throw new Error("Forbidden: Admin access required.");
    }
    return context;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/missing bearer token/i.test(message)) {
      throw error;
    }
  }

  const cookieHeader = request.headers.get("cookie") || "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("arc_admin_session="))
    ?.slice("arc_admin_session=".length);

  const session = readAdminSessionFromRequestCookie(token);
  if (!session) {
    throw new Error("Forbidden: Admin access required.");
  }

  const allowlist = await loadActiveAdminAllowlistByEmail(session.email);
  if (!allowlist?.active) {
    throw new Error("Forbidden: Admin access required.");
  }

  return {
    uid: allowlist.uid,
    email: allowlist.email || session.email,
    isAdminClaim: false,
    isAllowlistedAdmin: true,
    adminRole: allowlist.role,
    accountStatus: "active",
  };
};
