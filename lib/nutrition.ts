import type {
  ActiveNutritionPlan,
  ActivityLevel,
  FoodCatalogItem,
  GoalMode,
  MacroTargets,
  MealPlanFood,
  MealSlot,
  NutritionGoal,
  NutritionProfileSnapshot,
  PlannedMeal,
} from "@/types/nutrition";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const round = (value: number) => Math.max(0, Math.round(value));

export const calculateBmr = ({
  sex,
  age,
  heightCm,
  weightKg,
}: NutritionProfileSnapshot): number => {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === "male") return base + 5;
  if (sex === "female") return base - 161;
  return base - 78;
};

export const calculateMaintenanceCalories = (profile: NutritionProfileSnapshot): number => {
  return calculateBmr(profile) * ACTIVITY_MULTIPLIERS[profile.activityLevel];
};

export const calculateTargetCalories = ({
  profile,
  nutritionGoal,
  dailyCalorieOverride,
}: {
  profile: NutritionProfileSnapshot;
  nutritionGoal: NutritionGoal;
  dailyCalorieOverride: number | null;
}): { calories: number; goalMode: GoalMode } => {
  if (typeof dailyCalorieOverride === "number" && Number.isFinite(dailyCalorieOverride)) {
    return { calories: Math.max(1200, Math.min(5000, Math.round(dailyCalorieOverride))), goalMode: "manual" };
  }

  const maintenance = calculateMaintenanceCalories(profile);
  const adjusted =
    nutritionGoal === "lose" ? maintenance - 400 : nutritionGoal === "gain" ? maintenance + 300 : maintenance;

  return {
    calories: Math.max(1200, Math.min(5000, Math.round(adjusted))),
    goalMode: "preset",
  };
};

export const calculateMacroTargets = ({
  calories,
  weightKg,
  nutritionGoal,
}: {
  calories: number;
  weightKg: number;
  nutritionGoal: NutritionGoal;
}): MacroTargets => {
  let proteinGrams = nutritionGoal === "lose" ? weightKg * 2 : weightKg * 1.8;
  let fatGrams = weightKg * 0.8;
  let carbsGrams = (calories - proteinGrams * 4 - fatGrams * 9) / 4;

  if (carbsGrams < 80) {
    fatGrams = Math.max(weightKg * 0.6, 0);
    carbsGrams = 80;
    const remainingCalories = calories - fatGrams * 9 - carbsGrams * 4;
    proteinGrams = Math.max(remainingCalories / 4, weightKg * 1.2);
  }

  return {
    calories: round(calories),
    proteinGrams: round(proteinGrams),
    carbsGrams: round(carbsGrams),
    fatGrams: round(fatGrams),
  };
};

const mealSlotDistributions: Record<number, Array<{ slot: MealSlot; ratio: number }>> = {
  3: [
    { slot: "breakfast", ratio: 0.25 },
    { slot: "lunch", ratio: 0.35 },
    { slot: "dinner", ratio: 0.4 },
  ],
  4: [
    { slot: "breakfast", ratio: 0.25 },
    { slot: "lunch", ratio: 0.3 },
    { slot: "dinner", ratio: 0.3 },
    { slot: "snack1", ratio: 0.15 },
  ],
  5: [
    { slot: "breakfast", ratio: 0.2 },
    { slot: "lunch", ratio: 0.25 },
    { slot: "dinner", ratio: 0.25 },
    { slot: "snack1", ratio: 0.15 },
    { slot: "snack2", ratio: 0.15 },
  ],
};

const mealLabelBySlot: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack1: "Snack",
  snack2: "Snack 2",
};

const totalMacros = (foods: MealPlanFood[]): MacroTargets => ({
  calories: round(foods.reduce((sum, item) => sum + item.calories, 0)),
  proteinGrams: round(foods.reduce((sum, item) => sum + item.proteinGrams, 0)),
  carbsGrams: round(foods.reduce((sum, item) => sum + item.carbsGrams, 0)),
  fatGrams: round(foods.reduce((sum, item) => sum + item.fatGrams, 0)),
});

const scaledFood = (food: FoodCatalogItem, quantity: number): MealPlanFood => ({
  source: food.source,
  foodId: food.foodId,
  name: food.name,
  servingLabel: food.servingLabel,
  quantity,
  calories: round(food.calories * quantity),
  proteinGrams: round(food.proteinGrams * quantity),
  carbsGrams: round(food.carbsGrams * quantity),
  fatGrams: round(food.fatGrams * quantity),
});

const selectFood = (
  items: FoodCatalogItem[],
  fallback: FoodCatalogItem[],
  predicate: (item: FoodCatalogItem) => boolean,
): FoodCatalogItem | null => {
  return items.find(predicate) ?? fallback.find(predicate) ?? null;
};

export const buildDeterministicMealPlan = ({
  targets,
  mealsPerDay,
  catalog,
}: {
  targets: MacroTargets;
  mealsPerDay: number;
  catalog: FoodCatalogItem[];
}): { meals: PlannedMeal[]; warnings: string[]; baseSource: "usda" | "mixed" } => {
  const layout = mealSlotDistributions[mealsPerDay] ?? mealSlotDistributions[3];
  const warnings: string[] = [];
  let usedFallback = false;
  const fallback = catalog.filter((item) => item.source === "local");

  const meals = layout.map(({ slot, ratio }) => {
    const mealTag = slot.startsWith("snack") ? "snack" : slot;
    const candidates = catalog.filter((item) => item.mealTags.includes(mealTag as never));
    const protein = selectFood(candidates, fallback, (item) => item.category === "protein" || item.category === "dairy");
    const carb = selectFood(candidates, fallback, (item) => item.category === "carb" || item.category === "fruit");
    const produce = selectFood(candidates, fallback, (item) => item.category === "fruit" || item.category === "vegetable");
    const fat = selectFood(candidates, fallback, (item) => item.category === "fat");

    const chosen = [protein, carb, produce, fat].filter((item): item is FoodCatalogItem => Boolean(item));
    if (chosen.some((item) => item.source === "local")) usedFallback = true;

    const mealCalories = targets.calories * ratio;
    const foods: MealPlanFood[] = chosen.map((item) => {
      const quantity = Math.max(0.75, Math.min(2, mealCalories / Math.max(item.calories * chosen.length, 1)));
      return scaledFood(item, Number(quantity.toFixed(2)));
    });

    return {
      slot,
      label: mealLabelBySlot[slot],
      totals: totalMacros(foods),
      foods,
    };
  });

  const dayTotals = totalMacros(meals.flatMap((meal) => meal.foods));
  if (Math.abs(dayTotals.calories - targets.calories) > targets.calories * 0.12) {
    warnings.push("Targets approximated due to limited food catalog.");
  }

  return {
    meals,
    warnings,
    baseSource: usedFallback ? "mixed" : "usda",
  };
};

export const buildPlanSkeleton = ({
  profile,
  nutritionGoal,
  dailyCalorieOverride,
  mealsPerDay,
  catalog,
}: {
  profile: NutritionProfileSnapshot;
  nutritionGoal: NutritionGoal;
  dailyCalorieOverride: number | null;
  mealsPerDay: number;
  catalog: FoodCatalogItem[];
}): ActiveNutritionPlan => {
  const { calories, goalMode } = calculateTargetCalories({ profile, nutritionGoal, dailyCalorieOverride });
  const targets = calculateMacroTargets({
    calories,
    weightKg: profile.weightKg,
    nutritionGoal,
  });
  const { meals, warnings, baseSource } = buildDeterministicMealPlan({
    targets,
    mealsPerDay,
    catalog,
  });

  return {
    goalMode,
    nutritionGoal,
    dailyCalorieOverride,
    mealsPerDay,
    profileSnapshot: profile,
    targets,
    meals,
    warnings,
    generation: {
      baseSource,
      aiRefined: false,
      aiProvider: null,
    },
    generatedAt: new Date().toISOString(),
  };
};
