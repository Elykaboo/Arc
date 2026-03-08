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
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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
  1: [{ slot: "dinner", ratio: 1 }],
  2: [
    { slot: "lunch", ratio: 0.45 },
    { slot: "dinner", ratio: 0.55 },
  ],
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
  6: [
    { slot: "breakfast", ratio: 0.18 },
    { slot: "lunch", ratio: 0.22 },
    { slot: "dinner", ratio: 0.22 },
    { slot: "snack1", ratio: 0.12 },
    { slot: "snack2", ratio: 0.13 },
    { slot: "snack3", ratio: 0.13 },
  ],
  7: [
    { slot: "breakfast", ratio: 0.16 },
    { slot: "lunch", ratio: 0.2 },
    { slot: "dinner", ratio: 0.2 },
    { slot: "snack1", ratio: 0.11 },
    { slot: "snack2", ratio: 0.11 },
    { slot: "snack3", ratio: 0.11 },
    { slot: "snack4", ratio: 0.11 },
  ],
};

const mealLabelBySlot: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack1: "Snack",
  snack2: "Snack 2",
  snack3: "Snack 3",
  snack4: "Snack 4",
};

const totalMacros = (foods: MealPlanFood[]): MacroTargets => ({
  calories: round(foods.reduce((sum, item) => sum + item.calories, 0)),
  proteinGrams: round(foods.reduce((sum, item) => sum + item.proteinGrams, 0)),
  carbsGrams: round(foods.reduce((sum, item) => sum + item.carbsGrams, 0)),
  fatGrams: round(foods.reduce((sum, item) => sum + item.fatGrams, 0)),
});

const collapseDuplicateMealFoods = (meal: PlannedMeal): PlannedMeal => {
  const byFood = new Map<string, MealPlanFood>();

  for (const food of meal.foods) {
    const key = `${food.source}:${food.foodId}:${food.name}:${food.servingLabel}`;
    const existing = byFood.get(key);
    if (!existing) {
      byFood.set(key, { ...food });
      continue;
    }

    existing.quantity = quantizeTenth(existing.quantity + food.quantity);
    existing.calories = round(existing.calories + food.calories);
    existing.proteinGrams = round(existing.proteinGrams + food.proteinGrams);
    existing.carbsGrams = round(existing.carbsGrams + food.carbsGrams);
    existing.fatGrams = round(existing.fatGrams + food.fatGrams);
  }

  const foods = Array.from(byFood.values());
  return {
    ...meal,
    foods,
    totals: totalMacros(foods),
  };
};

const quantizeTenth = (value: number) => Math.round(value * 10) / 10;

const optimizeMealQuantities = (meals: PlannedMeal[], targets: MacroTargets): PlannedMeal[] => {
  const flatFoods = meals.flatMap((meal, mealIndex) =>
    meal.foods.map((food, foodIndex) => {
      const safeQuantity = Math.max(food.quantity, 0.1);
      return {
        mealIndex,
        foodIndex,
        base: {
          calories: food.calories / safeQuantity,
          proteinGrams: food.proteinGrams / safeQuantity,
          carbsGrams: food.carbsGrams / safeQuantity,
          fatGrams: food.fatGrams / safeQuantity,
        },
      };
    }),
  );

  if (flatFoods.length === 0) return meals;

  const quantities = meals.flatMap((meal) => meal.foods.map((food) => clamp(food.quantity, 0.1, 6)));
  const metrics: Array<keyof MacroTargets> = ["calories", "proteinGrams", "carbsGrams", "fatGrams"];

  for (let iteration = 0; iteration < 180; iteration += 1) {
    const totals = flatFoods.reduce(
      (acc, entry, index) => {
        const quantity = quantities[index];
        acc.calories += entry.base.calories * quantity;
        acc.proteinGrams += entry.base.proteinGrams * quantity;
        acc.carbsGrams += entry.base.carbsGrams * quantity;
        acc.fatGrams += entry.base.fatGrams * quantity;
        return acc;
      },
      { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
    );

    const relativeError = {
      calories: (totals.calories - targets.calories) / Math.max(targets.calories, 1),
      proteinGrams: (totals.proteinGrams - targets.proteinGrams) / Math.max(targets.proteinGrams, 1),
      carbsGrams: (totals.carbsGrams - targets.carbsGrams) / Math.max(targets.carbsGrams, 1),
      fatGrams: (totals.fatGrams - targets.fatGrams) / Math.max(targets.fatGrams, 1),
    };

    const converged =
      Math.abs(relativeError.calories) < 0.03 &&
      Math.abs(relativeError.proteinGrams) < 0.06 &&
      Math.abs(relativeError.carbsGrams) < 0.06 &&
      Math.abs(relativeError.fatGrams) < 0.06;
    if (converged) break;

    for (let index = 0; index < flatFoods.length; index += 1) {
      const entry = flatFoods[index];
      const gradient = metrics.reduce((sum, metric) => {
        const target = Math.max(targets[metric], 1);
        return sum + relativeError[metric] * (entry.base[metric] / target);
      }, 0);
      quantities[index] = clamp(quantities[index] - gradient * 0.42, 0.1, 6);
    }
  }

  const nextMeals = meals.map((meal) => ({
    ...meal,
    foods: meal.foods.map((food) => ({ ...food })),
  }));

  let cursor = 0;
  for (let mealIndex = 0; mealIndex < nextMeals.length; mealIndex += 1) {
    const meal = nextMeals[mealIndex];
    for (let foodIndex = 0; foodIndex < meal.foods.length; foodIndex += 1) {
      const food = meal.foods[foodIndex];
      const safeQuantity = Math.max(food.quantity, 0.1);
      const baseCalories = food.calories / safeQuantity;
      const baseProtein = food.proteinGrams / safeQuantity;
      const baseCarbs = food.carbsGrams / safeQuantity;
      const baseFat = food.fatGrams / safeQuantity;
      const quantity = quantizeTenth(quantities[cursor]);

      meal.foods[foodIndex] = {
        ...food,
        quantity,
        calories: round(baseCalories * quantity),
        proteinGrams: round(baseProtein * quantity),
        carbsGrams: round(baseCarbs * quantity),
        fatGrams: round(baseFat * quantity),
      };
      cursor += 1;
    }
    meal.totals = totalMacros(meal.foods);
  }

  return nextMeals;
};

const computeDayTotals = (meals: PlannedMeal[]): MacroTargets =>
  totalMacros(meals.flatMap((meal) => meal.foods));

const addTargetDeficitSupplements = ({
  meals,
  targets,
  catalog,
}: {
  meals: PlannedMeal[];
  targets: MacroTargets;
  catalog: FoodCatalogItem[];
}): PlannedMeal[] => {
  const nextMeals = meals.map((meal) => ({
    ...meal,
    foods: meal.foods.map((food) => ({ ...food })),
    totals: { ...meal.totals },
  }));

  const pickSlotIndex = (slotKeyword: string) => {
    const exact = nextMeals.findIndex((meal) => meal.slot.includes(slotKeyword as never));
    if (exact >= 0) return exact;
    return Math.max(0, nextMeals.length - 1);
  };

  const slotIndexByFocus = {
    proteinGrams: pickSlotIndex("dinner"),
    carbsGrams: pickSlotIndex("lunch"),
    fatGrams: pickSlotIndex("snack"),
    calories: pickSlotIndex("lunch"),
  } as const;

  const candidateByFocus = (focus: keyof MacroTargets, mealSlot: MealSlot) => {
    const mealTag = mealSlot.startsWith("snack") ? "snack" : mealSlot;
    const mealCandidates = catalog.filter((item) => item.mealTags.includes(mealTag as never));
    const ranked = mealCandidates
      .filter((item) => item.calories > 0)
      .sort((left, right) => {
        const lFocus = focus === "calories" ? left.calories : left[focus];
        const rFocus = focus === "calories" ? right.calories : right[focus];
        const lPenalty =
          (left.proteinGrams + left.carbsGrams + left.fatGrams) - (focus === "calories" ? 0 : left[focus]);
        const rPenalty =
          (right.proteinGrams + right.carbsGrams + right.fatGrams) - (focus === "calories" ? 0 : right[focus]);
        return rFocus - rPenalty * 0.18 - (lFocus - lPenalty * 0.18);
      });
    return ranked[0] ?? null;
  };

  for (let i = 0; i < 6; i += 1) {
    const totals = computeDayTotals(nextMeals);
    const deficits = {
      calories: targets.calories - totals.calories,
      proteinGrams: targets.proteinGrams - totals.proteinGrams,
      carbsGrams: targets.carbsGrams - totals.carbsGrams,
      fatGrams: targets.fatGrams - totals.fatGrams,
    };

    const focus = (["proteinGrams", "carbsGrams", "fatGrams", "calories"] as const)
      .filter((metric) => deficits[metric] > (metric === "calories" ? 35 : 6))
      .sort((left, right) => deficits[right] - deficits[left])[0];

    if (!focus) break;

    const slotIndex = slotIndexByFocus[focus];
    const meal = nextMeals[slotIndex] ?? nextMeals[nextMeals.length - 1];
    if (!meal) break;

    const candidate = candidateByFocus(focus, meal.slot);
    if (!candidate) break;

    const unit = focus === "calories" ? candidate.calories : candidate[focus];
    if (unit <= 0) continue;

    const desired = deficits[focus] / unit;
    const quantity = clamp(quantizeTenth(desired), 0.1, 2.5);
    if (quantity <= 0) continue;

    meal.foods.push(scaledFood(candidate, quantity));
    meal.totals = totalMacros(meal.foods);
  }

  return nextMeals;
};

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

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const pickVariedFood = ({
  items,
  fallback,
  predicate,
  key,
  varietySeed,
}: {
  items: FoodCatalogItem[];
  fallback: FoodCatalogItem[];
  predicate: (item: FoodCatalogItem) => boolean;
  key: string;
  varietySeed: number;
}) => {
  const pool = [...items, ...fallback.filter((item) => !items.some((candidate) => candidate.foodId === item.foodId))]
    .filter(predicate)
    .sort((left, right) => right.priority - left.priority);
  if (pool.length === 0) return null;

  const topWindow = Math.max(1, Math.min(4, pool.length));
  const offset = hashString(`${key}:${varietySeed}`) % topWindow;
  return pool[offset] ?? pool[0];
};

export const buildDeterministicMealPlan = ({
  targets,
  mealsPerDay,
  catalog,
  varietySeed = 0,
}: {
  targets: MacroTargets;
  mealsPerDay: number;
  catalog: FoodCatalogItem[];
  varietySeed?: number;
}): { meals: PlannedMeal[]; warnings: string[]; baseSource: "catalog" | "mixed" } => {
  const layout = mealSlotDistributions[mealsPerDay] ?? mealSlotDistributions[3];
  const warnings: string[] = [];
  let usedFallback = false;
  const fallback = catalog.filter((item) => item.source === "local");

  const meals = layout.map(({ slot, ratio }) => {
    const mealTag = slot.startsWith("snack") ? "snack" : slot;
    const candidates = catalog.filter((item) => item.mealTags.includes(mealTag as never));
    const protein = pickVariedFood({
      items: candidates,
      fallback,
      predicate: (item) => item.category === "protein" || item.category === "dairy",
      key: `${slot}:protein`,
      varietySeed,
    }) ?? selectFood(candidates, fallback, (item) => item.category === "protein" || item.category === "dairy");
    const carb = pickVariedFood({
      items: candidates,
      fallback,
      predicate: (item) => item.category === "carb" || item.category === "fruit",
      key: `${slot}:carb`,
      varietySeed,
    }) ?? selectFood(candidates, fallback, (item) => item.category === "carb" || item.category === "fruit");
    const produce = pickVariedFood({
      items: candidates,
      fallback,
      predicate: (item) => item.category === "fruit" || item.category === "vegetable",
      key: `${slot}:produce`,
      varietySeed,
    }) ?? selectFood(candidates, fallback, (item) => item.category === "fruit" || item.category === "vegetable");
    const fat = pickVariedFood({
      items: candidates,
      fallback,
      predicate: (item) => item.category === "fat",
      key: `${slot}:fat`,
      varietySeed,
    }) ?? selectFood(candidates, fallback, (item) => item.category === "fat");

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

  const supplementedMeals = addTargetDeficitSupplements({
    meals,
    targets,
    catalog,
  });
  const optimizedMeals = optimizeMealQuantities(supplementedMeals, targets);
  const normalizedMeals = optimizedMeals.map(collapseDuplicateMealFoods);

  const dayTotals = totalMacros(normalizedMeals.flatMap((meal) => meal.foods));
  if (Math.abs(dayTotals.calories - targets.calories) > targets.calories * 0.12) {
    warnings.push("Targets approximated due to limited food catalog.");
  }
  if (Math.abs(dayTotals.proteinGrams - targets.proteinGrams) > targets.proteinGrams * 0.2) {
    warnings.push("Protein target approximated due to available foods.");
  }
  if (Math.abs(dayTotals.carbsGrams - targets.carbsGrams) > targets.carbsGrams * 0.2) {
    warnings.push("Carb target approximated due to available foods.");
  }
  if (Math.abs(dayTotals.fatGrams - targets.fatGrams) > targets.fatGrams * 0.2) {
    warnings.push("Fat target approximated due to available foods.");
  }

  return {
    meals: normalizedMeals,
    warnings,
    baseSource: usedFallback ? "mixed" : "catalog",
  };
};

export const buildPlanSkeleton = ({
  profile,
  nutritionGoal,
  dailyCalorieOverride,
  mealsPerDay,
  catalog,
  varietySeed = 0,
}: {
  profile: NutritionProfileSnapshot;
  nutritionGoal: NutritionGoal;
  dailyCalorieOverride: number | null;
  mealsPerDay: number;
  catalog: FoodCatalogItem[];
  varietySeed?: number;
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
    varietySeed,
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
    },
    generatedAt: new Date().toISOString(),
  };
};
