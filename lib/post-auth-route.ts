import { loadUserProfile } from "@/lib/profile-db";

export const resolvePostAuthRoute = async ({
  uid,
  displayName,
  email,
}: {
  uid: string;
  displayName: string | null;
  email: string | null;
}): Promise<string> => {
  await loadUserProfile(uid).catch(() => null);

  const resolvedName = displayName?.trim() || email?.split("@")[0]?.trim() || "Athlete";
  return `/welcome?mode=returning&name=${encodeURIComponent(resolvedName)}&next=${encodeURIComponent("/socializing")}`;
};
