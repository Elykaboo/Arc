import { cookies } from "next/headers";
import { cache } from "react";
import { loadServerUserProfile } from "@/lib/server-profile-db";
import { getAdminAuth } from "@/lib/firebase-admin";
import { isNutritionProfileComplete } from "@/lib/nutrition-profile";

export const SESSION_COOKIE_NAME = "arc_session";

export type ServerSession = {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  onboardingComplete: boolean;
} | null;

const verifySessionCookie = cache(async (token: string): Promise<ServerSession> => {
  try {
    const auth = await getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const profile = await loadServerUserProfile(decoded.uid).catch(() => null);

    return {
      uid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : null,
      displayName: typeof decoded.name === "string" ? decoded.name : null,
      emailVerified: decoded.email_verified === true,
      onboardingComplete: profile ? isNutritionProfileComplete(profile) : false,
    };
  } catch {
    return null;
  }
});

export const getServerSession = cache(async (): Promise<ServerSession> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value?.trim();

  if (!token) {
    return null;
  }

  return verifySessionCookie(token);
});
