import process from "node:process";
import { readFile } from "node:fs/promises";
import { initializeApp, applicationDefault, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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

const readServerProjectId = () =>
  process.env.FIREBASE_PROJECT_ID?.trim() || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "";

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
      projectId: serviceAccount.project_id || readServerProjectId(),
    });
  }
  return initializeApp({
    credential: applicationDefault(),
    projectId: readServerProjectId(),
  });
};

const printUsage = () => {
  console.log("Usage:");
  console.log("  node scripts/bootstrap-admins.mjs grant <owner|moderator> <email> [grantedBy]");
  console.log("  node scripts/bootstrap-admins.mjs revoke <email>");
};

const run = async () => {
  await loadDotEnvLocal();
  const [command, arg1, arg2, arg3] = process.argv.slice(2);
  if (!command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  await initializeAdminApp();
  const auth = getAuth();
  const db = getFirestore();

  if (command === "grant") {
    const role = arg1 === "owner" ? "owner" : arg1 === "moderator" ? "moderator" : "";
    const email = arg2?.trim().toLowerCase() || "";
    const grantedBy = arg3?.trim() || "bootstrap-script";

    if (!role || !email) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    const user = await auth.getUserByEmail(email);
    const existingClaims = user.customClaims || {};
    await auth.setCustomUserClaims(user.uid, {
      ...existingClaims,
      admin: true,
    });

    await db.collection("admins").doc(user.uid).set(
      {
        email,
        role,
        active: true,
        grantedAt: FieldValue.serverTimestamp(),
        grantedBy,
      },
      { merge: true },
    );

    console.log(`Granted admin access to ${email} (${user.uid}) as ${role}.`);
    return;
  }

  if (command === "revoke") {
    const email = arg1?.trim().toLowerCase() || "";
    if (!email) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    const user = await auth.getUserByEmail(email);
    const existingClaims = user.customClaims || {};
    const rest = { ...existingClaims };
    delete rest.admin;
    await auth.setCustomUserClaims(user.uid, rest);
    await db.collection("admins").doc(user.uid).set(
      {
        active: false,
        revokedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    console.log(`Revoked admin access for ${email} (${user.uid}).`);
    return;
  }

  printUsage();
  process.exitCode = 1;
};

run().catch((error) => {
  console.error("Admin bootstrap failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
