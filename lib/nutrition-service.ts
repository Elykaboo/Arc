import { fallbackFoodCatalog } from "@/lib/food-catalog";
import { refineMealPlanWithGemini } from "@/lib/gemini-meal-planner";
import { saveActiveNutritionPlan } from "@/lib/nutrition-db";
import { nutritionFieldValidators } from "@/lib/nutrition-profile";
import { buildPlanSkeleton } from "@/lib/nutrition";
import {
  loadServerUserProfile,
  mergeServerUserProfile,
  saveServerUserProfile,
} from "@/lib/server-profile-db";
import { buildPlanningCatalog } from "@/lib/usda-foods";
import type { UserProfile } from "@/lib/profile-db";
import type {
  ActiveNutritionPlan,
  CreateNutritionPlanRequest,
  FoodCatalogItem,
  MealRefinementSuggestion,
  MealPlanFood,
  NutritionProfileSnapshot,
  PlannedMeal,
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

const rebuildMealsFromSuggestion = (
  suggestion: MealRefinementSuggestion,
  candidates: FoodCatalogItem[],
): PlannedMeal[] | null => {
  const candidateMap = new Map(candidates.map((item) => [item.foodId, item]));

  const toMealFood = (itemId: string, quantity: number): MealPlanFood | null => {
    const item = candidateMap.get(itemId);
    if (!item || !Number.isFinite(quantity) || quantity <= 0) return null;

    return {
      source: item.source,
      foodId: item.foodId,
      name: item.name,
      servingLabel: item.servingLabel,
      quantity,
      calories: Math.round(item.calories * quantity),
      proteinGrams: Math.round(item.proteinGrams * quantity),
      carbsGrams: Math.round(item.carbsGrams * quantity),
      fatGrams: Math.round(item.fatGrams * quantity),
    };
  };

  const meals = suggestion.meals.map((meal) => {
    const foods = meal.items
      .map((item) => toMealFood(item.foodId, item.quantity))
      .filter((item): item is MealPlanFood => Boolean(item));
    if (foods.length === 0) return null;

    return {
      slot: meal.slot,
      label: meal.label?.trim() || "Meal",
      foods,
      totals: {
        calories: foods.reduce((sum, item) => sum + item.calories, 0),
        proteinGrams: foods.reduce((sum, item) => sum + item.proteinGrams, 0),
        carbsGrams: foods.reduce((sum, item) => sum + item.carbsGrams, 0),
        fatGrams: foods.reduce((sum, item) => sum + item.fatGrams, 0),
      },
    };
  });

  if (meals.some((meal) => !meal)) return null;
  return meals as PlannedMeal[];
};

const maybeRefinePlan = async (
  plan: ActiveNutritionPlan,
  candidates: FoodCatalogItem[],
): Promise<ActiveNutritionPlan> => {
  try {
    const suggestion = await refineMealPlanWithGemini({
      targets: plan.targets,
      meals: plan.meals,
      candidates,
    });
    if (!suggestion) return plan;

    const refinedMeals = rebuildMealsFromSuggestion(suggestion, candidates);
    if (!refinedMeals || refinedMeals.length !== plan.meals.length) {
      return {
        ...plan,
        warnings: [...plan.warnings, "AI refinement returned unsupported meals; using base plan."],
      };
    }

    return {
      ...plan,
      meals: refinedMeals,
      generation: {
        ...plan.generation,
        aiRefined: true,
        aiProvider: "gemini",
      },
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      ...plan,
      warnings: [...plan.warnings, "AI refinement unavailable; using USDA-backed base plan."],
    };
  }
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

  const catalog = await buildPlanningCatalog().catch(() => fallbackFoodCatalog);
  const basePlan = buildPlanSkeleton({
    profile: toProfileSnapshot(mergedProfile),
    nutritionGoal: mergedProfile.nutritionGoal || "maintain",
    dailyCalorieOverride: mergedProfile.dailyCalorieOverride,
    mealsPerDay: mergedProfile.mealsPerDay || 3,
    catalog,
  });
  const finalPlan = await maybeRefinePlan(basePlan, catalog);
  await saveActiveNutritionPlan(uid, finalPlan);

  return {
    plan: finalPlan,
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

  const catalog = await buildPlanningCatalog().catch(() => fallbackFoodCatalog);
  const basePlan = buildPlanSkeleton({
    profile: toProfileSnapshot(profile),
    nutritionGoal: profile.nutritionGoal || "maintain",
    dailyCalorieOverride: profile.dailyCalorieOverride,
    mealsPerDay: profile.mealsPerDay || 3,
    catalog,
  });
  const finalPlan = await maybeRefinePlan(basePlan, catalog);
  await saveActiveNutritionPlan(uid, finalPlan);
  return finalPlan;
};
