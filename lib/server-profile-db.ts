import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import type { UserProfile } from "@/lib/profile-db";

const serverDefaultProfile: UserProfile = {
  username: "",
  sex: "",
  age: null,
  heightCm: null,
  weightKg: null,
  activityLevel: "",
  nutritionGoal: "",
  dailyCalorieOverride: null,
  mealsPerDay: null,
  bio: "",
  workoutSplit: "",
  photoDataUrl: "",
};

const profileRef = async (uid: string) => {
  const db = await getAdminDb();
  return db.collection("users").doc(uid).collection("profile").doc("details");
};

export const loadServerUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snapshot = await (await profileRef(uid)).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  const sex =
    data.sex === "male" || data.sex === "female" || data.sex === "other" ? data.sex : "";
  const activityLevel =
    data.activityLevel === "sedentary" ||
    data.activityLevel === "light" ||
    data.activityLevel === "moderate" ||
    data.activityLevel === "active" ||
    data.activityLevel === "very_active"
      ? data.activityLevel
      : "";
  const nutritionGoal =
    data.nutritionGoal === "lose" || data.nutritionGoal === "maintain" || data.nutritionGoal === "gain"
      ? data.nutritionGoal
      : "";
  return {
    username: typeof data.username === "string" ? data.username : "",
    sex,
    age: typeof data.age === "number" ? data.age : null,
    heightCm: typeof data.heightCm === "number" ? data.heightCm : null,
    weightKg: typeof data.weightKg === "number" ? data.weightKg : null,
    activityLevel,
    nutritionGoal,
    dailyCalorieOverride:
      typeof data.dailyCalorieOverride === "number" ? data.dailyCalorieOverride : null,
    mealsPerDay: typeof data.mealsPerDay === "number" ? data.mealsPerDay : null,
    bio: typeof data.bio === "string" ? data.bio : "",
    workoutSplit: typeof data.workoutSplit === "string" ? data.workoutSplit : "",
    photoDataUrl:
      typeof data.photoDataUrl === "string"
        ? data.photoDataUrl
        : typeof data.photoURL === "string"
          ? data.photoURL
          : "",
  };
};

export const mergeServerUserProfile = (
  current: UserProfile | null,
  updates: Partial<UserProfile>,
): UserProfile => {
  const definedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  ) as Partial<UserProfile>;

  return {
    ...serverDefaultProfile,
    ...current,
    ...definedUpdates,
  };
};

export const saveServerUserProfile = async (uid: string, profile: UserProfile): Promise<void> => {
  await (await profileRef(uid)).set(
    {
      ...profile,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
};
