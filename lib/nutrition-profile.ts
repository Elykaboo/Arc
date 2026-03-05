import type { ActivityLevel, NutritionGoal, Sex } from "@/types/nutrition";

type NutritionProfileLike = {
  sex?: Sex | "";
  age?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: ActivityLevel | "";
  nutritionGoal?: NutritionGoal | "";
  mealsPerDay?: number | null;
};

export const nutritionFieldValidators = {
  sex: (value: unknown) => value === "male" || value === "female" || value === "other",
  age: (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 13 && value <= 100,
  heightCm: (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 100 && value <= 250,
  weightKg: (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 30 && value <= 300,
  activityLevel: (value: unknown) =>
    value === "sedentary" ||
    value === "light" ||
    value === "moderate" ||
    value === "active" ||
    value === "very_active",
  nutritionGoal: (value: unknown) => value === "lose" || value === "maintain" || value === "gain",
  mealsPerDay: (value: unknown) =>
    typeof value === "number" && Number.isInteger(value) && value >= 2 && value <= 7,
  dailyCalorieOverride: (value: unknown) =>
    value == null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 1200 && value <= 5000),
} as const;

export const getMissingNutritionProfileFields = (profile: NutritionProfileLike): string[] => {
  const missing: string[] = [];

  if (!nutritionFieldValidators.sex(profile.sex)) missing.push("sex");
  if (!nutritionFieldValidators.age(profile.age)) missing.push("age");
  if (!nutritionFieldValidators.heightCm(profile.heightCm)) missing.push("heightCm");
  if (!nutritionFieldValidators.weightKg(profile.weightKg)) missing.push("weightKg");
  if (!nutritionFieldValidators.activityLevel(profile.activityLevel)) missing.push("activityLevel");
  if (!nutritionFieldValidators.nutritionGoal(profile.nutritionGoal)) missing.push("nutritionGoal");
  if (!nutritionFieldValidators.mealsPerDay(profile.mealsPerDay)) missing.push("mealsPerDay");

  return missing;
};

export const isNutritionProfileComplete = (profile: NutritionProfileLike): boolean =>
  getMissingNutritionProfileFields(profile).length === 0;
