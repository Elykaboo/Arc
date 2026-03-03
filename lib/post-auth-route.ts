import { loadUserProfile } from "@/lib/profile-db";
import { isNutritionProfileComplete } from "@/lib/nutrition-profile";

export const resolvePostAuthRoute = async ({
  uid,
  displayName,
  email,
}: {
  uid: string;
  displayName: string | null;
  email: string | null;
}): Promise<string> => {
  const profile = await loadUserProfile(uid).catch(() => null);
  if (!profile || !isNutritionProfileComplete(profile)) {
    return "/onboarding";
  }

  const resolvedName = displayName?.trim() || email?.split("@")[0]?.trim() || "Athlete";
  return `/welcome?mode=returning&name=${encodeURIComponent(resolvedName)}`;
};
