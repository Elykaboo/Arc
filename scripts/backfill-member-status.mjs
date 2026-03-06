import process from "node:process";
import { readFile } from "node:fs/promises";
import { initializeApp, applicationDefault, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const PAGE_SIZE = 500;

const loadDotEnvLocal = async () => {
  const raw = await readFile(".env.local", "utf8").catch(() => "");
  if (!raw) return;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) continue;
    const value = trimmed.slice(separator + 1).trim().replace(/^"(.*)"$/, "$1");
    process.env[key] = value;
  }
};

const parseServiceAccountFromEnv = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
};

const parseServiceAccountFromFile = async () => {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!serviceAccountPath) return null;
  const raw = await readFile(serviceAccountPath, "utf8");
  const parsed = JSON.parse(raw);
  if (typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
};

const initializeAdminApp = async () => {
  if (getApps().length > 0) return getApps()[0];
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

const run = async () => {
  await loadDotEnvLocal();
  await initializeAdminApp();
  const db = getFirestore();

  let lastDoc = null;
  let scanned = 0;
  let updated = 0;

  while (true) {
    let query = db.collection("members").orderBy("__name__").limit(PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();

    for (const doc of snapshot.docs) {
      scanned += 1;
      const data = doc.data() || {};
      if (typeof data.accountStatus === "string" && data.accountStatus.length > 0) {
        continue;
      }
      batch.set(
        doc.ref,
        {
          accountStatus: "active",
          suspensionReason: "",
          suspensionEndsAt: null,
          moderatedAt: null,
          moderatedBy: "",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      updated += 1;
    }

    await batch.commit();
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  console.log(`Members scanned: ${scanned}`);
  console.log(`Members backfilled: ${updated}`);
};

run().catch((error) => {
  console.error("Backfill member status failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
