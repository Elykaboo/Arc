import { readFile } from "node:fs/promises";
import { applicationDefault, cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

type RawServiceAccountShape = {
  project_id?: string;
  private_key?: string;
  client_email?: string;
};

const parseServiceAccountJson = (raw: string): RawServiceAccountShape => {
  const parsed = JSON.parse(raw) as RawServiceAccountShape;
  if (typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
};

const loadServiceAccount = async (): Promise<RawServiceAccountShape | null> => {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) {
    try {
      return parseServiceAccountJson(inlineJson);
    } catch (error) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!serviceAccountPath) return null;

  try {
    const raw = await readFile(serviceAccountPath, "utf8");
    return parseServiceAccountJson(raw);
  } catch (error) {
    throw new Error(
      `Unable to read FIREBASE_SERVICE_ACCOUNT_PATH: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const ensureAdminApp = async () => {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccount = await loadServiceAccount();
  if (serviceAccount?.client_email && serviceAccount.private_key) {
    return initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id,
        privateKey: serviceAccount.private_key,
        clientEmail: serviceAccount.client_email,
      } satisfies ServiceAccount),
      projectId: serviceAccount.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() || process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()) {
    throw new Error("Firebase Admin credentials were configured but could not be initialized.");
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
};

export const getAdminAuth = async () => {
  const app = await ensureAdminApp();
  return getAuth(app);
};

export const getAdminDb = async () => {
  const app = await ensureAdminApp();
  return getFirestore(app);
};
