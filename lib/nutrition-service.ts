import { fallbackFoodCatalog } from "@/lib/food-catalog";
import { saveActiveNutritionPlan } from "@/lib/nutrition-db";
import { nutritionFieldValidators } from "@/lib/nutrition-profile";
import { buildPlanSkeleton } from "@/lib/nutrition";
import {
  loadServerUserProfile,
  mergeServerUserProfile,
  saveServerUserProfile,
} from "@/lib/server-profile-db";
import { buildPlanningCatalog } from "@/lib/catalog-foods";
import type { UserProfile } from "@/lib/profile-db";
import type {
  ActiveNutritionPlan,
  CreateNutritionPlanRequest,
  NutritionProfileSnapshot,
} from "@/types/nutrition";

export const parseOptionalNumber = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
};

export const normalizeNutritionRequest = (body: Record<string, unknown>): CreateNutritionPlanRequest => ({
  sex:
    body.sex === "male" || body.sex === "female" || body.sex === "other" ? body.sex : undefined,
  age: parseOptionalNumber(body.age),
  heightCm: parseOptionalNumber(body.heightCm),
  weightKg: parseOptionalNumber(body.weightKg),
  activityLevel:
    body.activityLevel === "sedentary" ||
    body.activityLevel === "light" ||
    body.activityLevel === "moderate" ||
    body.activityLevel === "active" ||
    body.activityLevel === "very_active"
      ? body.activityLevel
      : undefined,
  nutritionGoal:
    body.nutritionGoal === "lose" || body.nutritionGoal === "maintain" || body.nutritionGoal === "gain"
      ? body.nutritionGoal
      : undefined,
  dailyCalorieOverride: parseOptionalNumber(body.dailyCalorieOverride),
  mealsPerDay: parseOptionalNumber(body.mealsPerDay),
});

export const validateNutritionProfileInput = (profile: Partial<UserProfile>): string[] => {
  const errors: string[] = [];
  if (profile.sex !== undefined && !nutritionFieldValidators.sex(profile.sex)) errors.push("sex");
  if (profile.age !== undefined && !nutritionFieldValidators.age(profile.age)) errors.push("age");
  if (profile.heightCm !== undefined && !nutritionFieldValidators.heightCm(profile.heightCm)) errors.push("heightCm");
  if (profile.weightKg !== undefined && !nutritionFieldValidators.weightKg(profile.weightKg)) errors.push("weightKg");
  if (profile.activityLevel !== undefined && !nutritionFieldValidators.activityLevel(profile.activityLevel)) {
    errors.push("activityLevel");
  }
  if (profile.nutritionGoal !== undefined && !nutritionFieldValidators.nutritionGoal(profile.nutritionGoal)) {
    errors.push("nutritionGoal");
  }
  if (profile.mealsPerDay !== undefined && !nutritionFieldValidators.mealsPerDay(profile.mealsPerDay)) {
    errors.push("mealsPerDay");
  }
  if (
    profile.dailyCalorieOverride !== undefined &&
    !nutritionFieldValidators.dailyCalorieOverride(profile.dailyCalorieOverride)
  ) {
    errors.push("dailyCalorieOverride");
  }
  return errors;
};

const toProfileSnapshot = (profile: UserProfile): NutritionProfileSnapshot => ({
  sex: profile.sex || "other",
  age: profile.age ?? 18,
  heightCm: profile.heightCm ?? 170,
  weightKg: profile.weightKg ?? 70,
  activityLevel: profile.activityLevel || "moderate",
});

const generateDeterministicPlan = async ({
  profile,
  mealsPerDay,
}: {
  profile: UserProfile;
  mealsPerDay: number;
}): Promise<ActiveNutritionPlan> => {
  const catalog = await buildPlanningCatalog().catch(() => fallbackFoodCatalog);
  return buildPlanSkeleton({
    profile: toProfileSnapshot(profile),
    nutritionGoal: profile.nutritionGoal || "maintain",
    dailyCalorieOverride: profile.dailyCalorieOverride,
    mealsPerDay,
    catalog,
    varietySeed: Date.now(),
  });
};

export const createOrUpdateNutritionPlan = async (
  uid: string,
  request: CreateNutritionPlanRequest,
): Promise<{ plan: ActiveNutritionPlan; profile: UserProfile }> => {
  const currentProfile = await loadServerUserProfile(uid);
  const mergedProfile = mergeServerUserProfile(currentProfile, {
    ...request,
  });
  const validationErrors = validateNutritionProfileInput(mergedProfile);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid nutrition fields: ${validationErrors.join(", ")}`);
  }

  await saveServerUserProfile(uid, mergedProfile);

  const plan = await generateDeterministicPlan({
    profile: mergedProfile,
    mealsPerDay: mergedProfile.mealsPerDay || 3,
  });
  await saveActiveNutritionPlan(uid, plan);

  return {
    plan,
    profile: mergedProfile,
  };
};

export const regenerateNutritionPlan = async (uid: string): Promise<ActiveNutritionPlan> => {
  const profile = await loadServerUserProfile(uid);
  if (!profile) {
    throw new Error("Profile not found.");
  }

  const validationErrors = validateNutritionProfileInput(profile);
  if (validationErrors.length > 0) {
    throw new Error(`Profile is incomplete: ${validationErrors.join(", ")}`);
  }

  const plan = await generateDeterministicPlan({
    profile,
    mealsPerDay: profile.mealsPerDay || 3,
  });
  await saveActiveNutritionPlan(uid, plan);
  return plan;
};
