import type { User } from "firebase/auth";
import { saveMemberProfile } from "@/lib/member-db";
import { savePublicUserProfile } from "@/lib/public-profile-db";
import { saveUserProfile, type UserProfile } from "@/lib/profile-db";

export const buildStarterProfile = (user: Pick<User, "displayName" | "email">): UserProfile => ({
  username: user.displayName?.trim() || user.email?.split("@")[0]?.trim() || "Athlete",
  gender: "",
  bio: "",
  workoutSplit: "",
  photoDataUrl: "",
});

export const initializeVerifiedUserProfile = async (
  user: Pick<User, "uid" | "displayName" | "email">,
): Promise<void> => {
  const starterProfile = buildStarterProfile(user);

  await saveUserProfile(user.uid, starterProfile);
  await saveMemberProfile(user.uid, starterProfile);
  await savePublicUserProfile(user.uid, starterProfile);
};
