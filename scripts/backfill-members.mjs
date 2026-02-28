import process from "node:process";
import { readFile } from "node:fs/promises";
import { initializeApp, applicationDefault, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const DEFAULT_PAGE_SIZE = 1000;

const parseServiceAccountFromEnv = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.private_key === "string") {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
};

const parseServiceAccountFromFile = async () => {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!serviceAccountPath) return null;

  try {
    const raw = await readFile(serviceAccountPath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.private_key === "string") {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Unable to read FIREBASE_SERVICE_ACCOUNT_PATH: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
};

const initializeAdminApp = async () => {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccount = parseServiceAccountFromEnv() ?? (await parseServiceAccountFromFile());

  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
};

const buildMemberDocument = (userRecord) => {
  const username =
    userRecord.displayName?.trim() ||
    userRecord.email?.split("@")[0]?.trim() ||
    `user-${userRecord.uid.slice(0, 8)}`;

  return {
    username,
    bio: "",
    workoutSplit: "",
    photoDataUrl: userRecord.photoURL?.trim() || "",
    updatedAt: FieldValue.serverTimestamp(),
  };
};

const run = async () => {
  await initializeAdminApp();

  const auth = getAuth();
  const db = getFirestore();

  let nextPageToken;
  let totalAuthUsers = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  do {
    const page = await auth.listUsers(DEFAULT_PAGE_SIZE, nextPageToken);

    for (const userRecord of page.users) {
      totalAuthUsers += 1;

      const memberRef = db.collection("members").doc(userRecord.uid);
      const snapshot = await memberRef.get();
      const nextData = buildMemberDocument(userRecord);

      if (!snapshot.exists) {
        await memberRef.set(nextData, { merge: true });
        createdCount += 1;
        continue;
      }

      const current = snapshot.data() || {};
      const hasDifferentUsername =
        typeof current.username !== "string" || current.username.trim() !== nextData.username;
      const hasDifferentPhoto =
        typeof current.photoDataUrl !== "string" || current.photoDataUrl.trim() !== nextData.photoDataUrl;

      if (!hasDifferentUsername && !hasDifferentPhoto) {
        skippedCount += 1;
        continue;
      }

      await memberRef.set(
        {
          username: nextData.username,
          photoDataUrl: nextData.photoDataUrl,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      updatedCount += 1;
    }

    nextPageToken = page.pageToken;
  } while (nextPageToken);

  console.log(`Auth users scanned: ${totalAuthUsers}`);
  console.log(`Members created: ${createdCount}`);
  console.log(`Members updated: ${updatedCount}`);
  console.log(`Members unchanged: ${skippedCount}`);
};

run().catch((error) => {
  console.error("Member backfill failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
