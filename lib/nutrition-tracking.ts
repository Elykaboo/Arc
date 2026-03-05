import type {
  ActiveNutritionPlan,
  CreateCustomFoodRequest,
  CreateLogEntryRequest,
  CreateRecipeRequest,
  CreateSavedMealRequest,
  CustomFood,
  DailyNutritionLog,
  LoggedFoodEntry,
  LoggedMeal,
  MacroTargets,
  MealSetup,
  MealSlotConfig,
  MealSlot,
  NutritionDashboardResponse,
  NutritionGoal,
  NutritionPlanSuggestion,
  NutritionSearchResult,
  Recipe,
  RecipeIngredient,
  SavedMeal,
  SavedMealItem,
  UpdateLogEntryRequest,
} from "@/types/nutrition";

export const MIN_MEAL_SLOTS = 1;
export const MAX_MEAL_SLOTS = 8;

const clampNumber = (value: number, min = 0) => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Number(value));
};

const round = (value: number) => Math.round(value * 10) / 10;

export const emptyMacros = (): MacroTargets => ({
  calories: 0,
  proteinGrams: 0,
  carbsGrams: 0,
  fatGrams: 0,
});

export const addMacros = (left: MacroTargets, right: MacroTargets): MacroTargets => ({
  calories: round(left.calories + right.calories),
  proteinGrams: round(left.proteinGrams + right.proteinGrams),
  carbsGrams: round(left.carbsGrams + right.carbsGrams),
  fatGrams: round(left.fatGrams + right.fatGrams),
});

export const subtractMacros = (left: MacroTargets, right: MacroTargets): MacroTargets => ({
  calories: round(left.calories - right.calories),
  proteinGrams: round(left.proteinGrams - right.proteinGrams),
  carbsGrams: round(left.carbsGrams - right.carbsGrams),
  fatGrams: round(left.fatGrams - right.fatGrams),
});

const sumEntries = (entries: Array<Pick<LoggedFoodEntry, keyof MacroTargets>>): MacroTargets =>
  entries.reduce(
    (totals, entry) =>
      addMacros(totals, {
        calories: entry.calories,
        proteinGrams: entry.proteinGrams,
        carbsGrams: entry.carbsGrams,
        fatGrams: entry.fatGrams,
      }),
    emptyMacros(),
  );

export const createMealSlotId = () => `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const createEntityId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const defaultMealLabels = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snack",
  "Snack 2",
  "Meal 6",
  "Meal 7",
  "Meal 8",
];

export const buildDefaultMealSlots = (count: number): MealSlotConfig[] => {
  const resolvedCount = Math.max(MIN_MEAL_SLOTS, Math.min(MAX_MEAL_SLOTS, Math.floor(count) || 3));
  return Array.from({ length: resolvedCount }, (_, index) => ({
    id: createMealSlotId(),
    label: defaultMealLabels[index] ?? `Meal ${index + 1}`,
    position: index,
  }));
};

export const resolveDefaultMealSetup = ({
  uid,
  mealsPerDay,
  existing,
}: {
  uid: string;
  mealsPerDay?: number | null;
  existing?: MealSetup | null;
}): MealSetup => {
  if (existing?.slots?.length) {
    return {
      uid,
      slots: normalizeMealSlots(existing.slots),
      updatedAt: existing.updatedAt,
    };
  }

  return {
    uid,
    slots: buildDefaultMealSlots(mealsPerDay ?? 3),
  };
};

export const normalizeMealSlots = (slots: MealSlotConfig[]): MealSlotConfig[] =>
  slots
    .map((slot, index) => ({
      id: slot.id?.trim() || createMealSlotId(),
      label: slot.label?.trim() || `Meal ${index + 1}`,
      position: index,
    }))
    .sort((a, b) => a.position - b.position);

export const validateMealSetup = (slots: MealSlotConfig[]): string | null => {
  if (!Array.isArray(slots)) return "Meal setup must be a list of slots.";
  if (slots.length < MIN_MEAL_SLOTS || slots.length > MAX_MEAL_SLOTS) {
    return `Meal setup must contain between ${MIN_MEAL_SLOTS} and ${MAX_MEAL_SLOTS} slots.`;
  }

  const seen = new Set<string>();
  for (const slot of slots) {
    const id = slot.id?.trim();
    const label = slot.label?.trim();
    if (!id) return "Each meal slot needs a stable id.";
    if (!label) return "Each meal slot needs a label.";
    if (seen.has(id)) return "Meal slot ids must be unique.";
    seen.add(id);
  }

  return null;
};

export const coerceDateKey = (value?: string | null): string => {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
};

export const buildEmptyDailyLog = ({
  uid,
  date,
  targets,
  mealSetup,
}: {
  uid: string;
  date: string;
  targets: MacroTargets;
  mealSetup: MealSetup;
}): DailyNutritionLog => {
  const meals = mealSetup.slots.map((slot) => ({
    slotId: slot.id,
    slotLabel: slot.label,
    entries: [],
    totals: emptyMacros(),
  }));

  return {
    uid,
    date,
    targetSnapshot: targets,
    mealSetupSnapshot: mealSetup.slots,
    meals,
    totals: emptyMacros(),
    remaining: { ...targets },
  };
};

export const recalculateDailyLog = (log: DailyNutritionLog, mealSetup?: MealSetup): DailyNutritionLog => {
  const slotSource = mealSetup?.slots?.length ? mealSetup.slots : log.mealSetupSnapshot;
  const meals: LoggedMeal[] = slotSource.map((slot) => {
    const current = log.meals.find((meal) => meal.slotId === slot.id);
    const entries = (current?.entries ?? []).map((entry) => ({
      ...entry,
      mealSlotId: slot.id,
      mealSlotLabelSnapshot: slot.label,
    }));

    return {
      slotId: slot.id,
      slotLabel: slot.label,
      entries,
      totals: sumEntries(entries),
    };
  });

  const totals = meals.reduce((acc, meal) => addMacros(acc, meal.totals), emptyMacros());
  const remaining = {
    calories: round(log.targetSnapshot.calories - totals.calories),
    proteinGrams: round(log.targetSnapshot.proteinGrams - totals.proteinGrams),
    carbsGrams: round(log.targetSnapshot.carbsGrams - totals.carbsGrams),
    fatGrams: round(log.targetSnapshot.fatGrams - totals.fatGrams),
  };

  return {
    ...log,
    mealSetupSnapshot: slotSource,
    meals,
    totals,
    remaining,
  };
};

export const scaleEntry = (entry: Omit<LoggedFoodEntry, "id" | "loggedAt" | "mealSlotId" | "mealSlotLabelSnapshot">, quantity: number) => {
  const resolvedQuantity = clampNumber(quantity, 0.1);
  const ratio = resolvedQuantity / Math.max(entry.quantity, 0.1);
  return {
    ...entry,
    quantity: round(resolvedQuantity),
    calories: round(entry.calories * ratio),
    proteinGrams: round(entry.proteinGrams * ratio),
    carbsGrams: round(entry.carbsGrams * ratio),
    fatGrams: round(entry.fatGrams * ratio),
  };
};

export const buildLogEntryFromSearchResult = ({
  item,
  mealSlotId,
  mealSlotLabel,
  quantity,
  createdFromPlan,
}: {
  item: NutritionSearchResult;
  mealSlotId: string;
  mealSlotLabel: string;
  quantity?: number;
  createdFromPlan?: boolean;
}): LoggedFoodEntry => {
  const base = scaleEntry(
    {
      entryType: item.itemType,
      sourceId: item.sourceId,
      name: item.name,
      servingLabel: item.servingLabel,
      quantity: 1,
      calories: item.calories,
      proteinGrams: item.proteinGrams,
      carbsGrams: item.carbsGrams,
      fatGrams: item.fatGrams,
      createdFromPlan: Boolean(createdFromPlan),
    },
    quantity ?? 1,
  );

  return {
    id: createEntityId("entry"),
    mealSlotId,
    mealSlotLabelSnapshot: mealSlotLabel,
    loggedAt: new Date().toISOString(),
    ...base,
  };
};

export const validateCustomFoodInput = (input: CreateCustomFoodRequest): string | null => {
  if (!input.name?.trim()) return "Food name is required.";
  if (!input.servingLabel?.trim()) return "Serving label is required.";
  if (!Number.isFinite(input.servingAmount) || input.servingAmount <= 0) return "Serving amount must be greater than 0.";
  for (const field of ["calories", "proteinGrams", "carbsGrams", "fatGrams"] as const) {
    if (!Number.isFinite(input[field]) || input[field] < 0) return `${field} must be 0 or greater.`;
  }
  return null;
};

export const toCustomFood = (uid: string, input: CreateCustomFoodRequest, existingId?: string, createdAt?: string): CustomFood => {
  const now = new Date().toISOString();
  return {
    id: existingId ?? createEntityId("food"),
    uid,
    name: input.name.trim(),
    brandName: input.brandName?.trim() || null,
    servingLabel: input.servingLabel.trim(),
    servingAmount: round(input.servingAmount),
    calories: round(input.calories),
    proteinGrams: round(input.proteinGrams),
    carbsGrams: round(input.carbsGrams),
    fatGrams: round(input.fatGrams),
    category: input.category,
    createdAt: createdAt ?? now,
    updatedAt: now,
  };
};

export const validateRecipeInput = (input: CreateRecipeRequest): string | null => {
  if (!input.name?.trim()) return "Recipe name is required.";
  if (!Number.isFinite(input.servings) || input.servings <= 0) return "Recipe servings must be greater than 0.";
  if (!Array.isArray(input.ingredients) || input.ingredients.length === 0) return "Recipe needs at least one ingredient.";
  return null;
};

export const calculateRecipeTotals = (ingredients: RecipeIngredient[]): MacroTargets =>
  ingredients.reduce(
    (totals, ingredient) =>
      addMacros(totals, {
        calories: ingredient.calories,
        proteinGrams: ingredient.proteinGrams,
        carbsGrams: ingredient.carbsGrams,
        fatGrams: ingredient.fatGrams,
      }),
    emptyMacros(),
  );

export const toRecipe = (uid: string, input: CreateRecipeRequest, existingId?: string, createdAt?: string): Recipe => {
  const now = new Date().toISOString();
  const totals = calculateRecipeTotals(input.ingredients);
  const servings = Math.max(1, input.servings);
  return {
    id: existingId ?? createEntityId("recipe"),
    uid,
    name: input.name.trim(),
    servings,
    ingredients: input.ingredients.map((ingredient) => ({
      ...ingredient,
      quantity: round(ingredient.quantity),
      calories: round(ingredient.calories),
      proteinGrams: round(ingredient.proteinGrams),
      carbsGrams: round(ingredient.carbsGrams),
      fatGrams: round(ingredient.fatGrams),
    })),
    totals,
    perServing: {
      calories: round(totals.calories / servings),
      proteinGrams: round(totals.proteinGrams / servings),
      carbsGrams: round(totals.carbsGrams / servings),
      fatGrams: round(totals.fatGrams / servings),
    },
    createdAt: createdAt ?? now,
    updatedAt: now,
  };
};

export const validateSavedMealInput = (input: CreateSavedMealRequest): string | null => {
  if (!input.name?.trim()) return "Saved meal name is required.";
  if (!Array.isArray(input.items) || input.items.length === 0) return "Saved meal needs at least one item.";
  return null;
};

const calculateSavedMealTotals = (items: SavedMealItem[]): MacroTargets =>
  items.reduce(
    (totals, item) =>
      addMacros(totals, {
        calories: item.calories,
        proteinGrams: item.proteinGrams,
        carbsGrams: item.carbsGrams,
        fatGrams: item.fatGrams,
      }),
    emptyMacros(),
  );

export const toSavedMeal = (uid: string, input: CreateSavedMealRequest, existingId?: string, createdAt?: string): SavedMeal => {
  const now = new Date().toISOString();
  return {
    id: existingId ?? createEntityId("saved-meal"),
    uid,
    name: input.name.trim(),
    slotSuggestionId: input.slotSuggestionId ?? null,
    slotSuggestionLabel: input.slotSuggestionLabel?.trim() || null,
    items: input.items.map((item) => ({
      ...item,
      quantity: round(item.quantity),
      calories: round(item.calories),
      proteinGrams: round(item.proteinGrams),
      carbsGrams: round(item.carbsGrams),
      fatGrams: round(item.fatGrams),
    })),
    totals: calculateSavedMealTotals(input.items),
    createdAt: createdAt ?? now,
    updatedAt: now,
  };
};

export const normalizePlanSuggestions = (plan: ActiveNutritionPlan | null): NutritionPlanSuggestion[] => {
  if (!plan) return [];

  const formatPlannedServingLabel = (servingLabel: string, quantity: number) => {
    const safeQuantity = Math.max(0.1, quantity);
    const gramsMatch = servingLabel.trim().match(/^(\d+(?:\.\d+)?)\s*g$/i);
    if (gramsMatch) {
      const baseGrams = Number(gramsMatch[1]);
      const totalGrams = Math.round(baseGrams * safeQuantity * 10) / 10;
      return `${Number.isInteger(totalGrams) ? totalGrams : totalGrams.toFixed(1)} g`;
    }
    if (Math.abs(safeQuantity - 1) < 0.05) return servingLabel;
    const displayQuantity = Number.isInteger(safeQuantity) ? String(safeQuantity) : safeQuantity.toFixed(1);
    return `${displayQuantity} x ${servingLabel}`;
  };

  return plan.meals.map((meal) => ({
    slot: meal.slot,
    label: meal.label,
    foods: meal.foods.map((food, index) => ({
      id: `plan-${meal.slot}-${food.foodId}-${index}`,
      itemType: "planned_food",
      sourceId: food.foodId,
      name: food.name,
      subtitle: `${meal.label} suggestion`,
      servingLabel: formatPlannedServingLabel(food.servingLabel, food.quantity),
      calories: food.calories,
      proteinGrams: food.proteinGrams,
      carbsGrams: food.carbsGrams,
      fatGrams: food.fatGrams,
    })),
  }));
};

export const foodToSearchResult = (food: CustomFood): NutritionSearchResult => ({
  id: `custom-food-${food.id}`,
  itemType: "custom_food",
  sourceId: food.id,
  name: food.name,
  subtitle: food.brandName ? `Custom food • ${food.brandName}` : "Custom food",
  servingLabel: food.servingLabel,
  calories: food.calories,
  proteinGrams: food.proteinGrams,
  carbsGrams: food.carbsGrams,
  fatGrams: food.fatGrams,
  brandName: food.brandName ?? undefined,
});

export const recipeToSearchResult = (recipe: Recipe): NutritionSearchResult => ({
  id: `recipe-${recipe.id}`,
  itemType: "recipe",
  sourceId: recipe.id,
  name: recipe.name,
  subtitle: `${recipe.ingredients.length} ingredients • ${recipe.servings} servings`,
  servingLabel: "1 serving",
  calories: recipe.perServing.calories,
  proteinGrams: recipe.perServing.proteinGrams,
  carbsGrams: recipe.perServing.carbsGrams,
  fatGrams: recipe.perServing.fatGrams,
});

export const savedMealToSearchResult = (savedMeal: SavedMeal): NutritionSearchResult => ({
  id: `saved-meal-${savedMeal.id}`,
  itemType: "saved_meal",
  sourceId: savedMeal.id,
  name: savedMeal.name,
  subtitle: `${savedMeal.items.length} items`,
  servingLabel: "1 saved meal",
  calories: savedMeal.totals.calories,
  proteinGrams: savedMeal.totals.proteinGrams,
  carbsGrams: savedMeal.totals.carbsGrams,
  fatGrams: savedMeal.totals.fatGrams,
  slotSuggestionId: savedMeal.slotSuggestionId,
  slotSuggestionLabel: savedMeal.slotSuggestionLabel,
});

export const planFoodToSearchResult = ({
  planSlot,
  planLabel,
  food,
  foodIndex = 0,
}: {
  planSlot: MealSlot;
  planLabel: string;
  food: ActiveNutritionPlan["meals"][number]["foods"][number];
  foodIndex?: number;
}): NutritionSearchResult => {
  const gramsMatch = food.servingLabel.trim().match(/^(\d+(?:\.\d+)?)\s*g$/i);
  const servingLabel = (() => {
    if (gramsMatch) {
      const baseGrams = Number(gramsMatch[1]);
      const totalGrams = Math.round(baseGrams * Math.max(food.quantity, 0.1) * 10) / 10;
      return `${Number.isInteger(totalGrams) ? totalGrams : totalGrams.toFixed(1)} g`;
    }
    if (Math.abs(food.quantity - 1) < 0.05) return food.servingLabel;
    const displayQuantity = Number.isInteger(food.quantity) ? String(food.quantity) : food.quantity.toFixed(1);
    return `${displayQuantity} x ${food.servingLabel}`;
  })();

  return {
    id: `planned-food-${planSlot}-${food.foodId}-${foodIndex}`,
    itemType: "planned_food",
    sourceId: food.foodId,
    name: food.name,
    subtitle: `Plan • ${planLabel}`,
    servingLabel,
    calories: food.calories,
    proteinGrams: food.proteinGrams,
    carbsGrams: food.carbsGrams,
    fatGrams: food.fatGrams,
  };
};

export const normalizeUsdaSearchResult = (item: {
  foodId: string;
  name: string;
  servingLabel: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  brandOwner?: string;
  dataType?: string;
}): NutritionSearchResult => ({
  id: `usda-${item.foodId}`,
  itemType: "usda",
  sourceId: item.foodId,
  name: item.name,
  subtitle: item.brandOwner ? `USDA • ${item.brandOwner}` : `USDA${item.dataType ? ` • ${item.dataType}` : ""}`,
  servingLabel: item.servingLabel,
  calories: round(item.calories),
  proteinGrams: round(item.proteinGrams),
  carbsGrams: round(item.carbsGrams),
  fatGrams: round(item.fatGrams),
  brandName: item.brandOwner,
});

export const toDashboardResponse = ({
  date,
  mealSetup,
  log,
  plan,
  recentItems,
  frequentItems,
  customFoods,
  recipes,
  savedMeals,
}: {
  date: string;
  mealSetup: MealSetup;
  log: DailyNutritionLog;
  plan: ActiveNutritionPlan | null;
  recentItems: NutritionSearchResult[];
  frequentItems: NutritionSearchResult[];
  customFoods: CustomFood[];
  recipes: Recipe[];
  savedMeals: SavedMeal[];
}): NutritionDashboardResponse => ({
  date,
  targets: log.targetSnapshot,
  totals: log.totals,
  remaining: log.remaining,
  mealSetup,
  meals: log.meals,
  recentItems,
  frequentItems,
  myFoodsCount: customFoods.length,
  myRecipesCount: recipes.length,
  myMealsCount: savedMeals.length,
  planSuggestions: normalizePlanSuggestions(plan),
  plan,
});

export const mergeRecentResults = (entries: LoggedFoodEntry[]): NutritionSearchResult[] => {
  const seen = new Set<string>();
  const results: NutritionSearchResult[] = [];

  for (const entry of [...entries].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))) {
    const key = `${entry.entryType}:${entry.sourceId ?? entry.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      id: `recent-${entry.id}`,
      itemType: entry.entryType,
      sourceId: entry.sourceId,
      name: entry.name,
      subtitle: "Recent",
      servingLabel: entry.servingLabel,
      calories: entry.calories,
      proteinGrams: entry.proteinGrams,
      carbsGrams: entry.carbsGrams,
      fatGrams: entry.fatGrams,
    });
    if (results.length >= 8) break;
  }

  return results;
};

export const mergeFrequentResults = (entries: LoggedFoodEntry[]): NutritionSearchResult[] => {
  const tally = new Map<
    string,
    { count: number; latest: LoggedFoodEntry }
  >();

  for (const entry of entries) {
    const key = `${entry.entryType}:${entry.sourceId ?? entry.name}`;
    const current = tally.get(key);
    if (!current || current.latest.loggedAt < entry.loggedAt) {
      tally.set(key, { count: (current?.count ?? 0) + 1, latest: entry });
    } else {
      tally.set(key, { count: current.count + 1, latest: current.latest });
    }
  }

  return [...tally.values()]
    .sort((a, b) => b.count - a.count || b.latest.loggedAt.localeCompare(a.latest.loggedAt))
    .slice(0, 8)
    .map(({ latest, count }) => ({
      id: `frequent-${latest.id}`,
      itemType: latest.entryType,
      sourceId: latest.sourceId,
      name: latest.name,
      subtitle: `Frequent • ${count} logs`,
      servingLabel: latest.servingLabel,
      calories: latest.calories,
      proteinGrams: latest.proteinGrams,
      carbsGrams: latest.carbsGrams,
      fatGrams: latest.fatGrams,
    }));
};

export const normalizeLogEntryPayload = (body: Record<string, unknown>): CreateLogEntryRequest => ({
  mealSlotId: typeof body.mealSlotId === "string" ? body.mealSlotId : "",
  mealSlotLabel: typeof body.mealSlotLabel === "string" ? body.mealSlotLabel : undefined,
  entryType:
    body.entryType === "usda" ||
    body.entryType === "custom_food" ||
    body.entryType === "recipe" ||
    body.entryType === "saved_meal" ||
    body.entryType === "planned_food"
      ? body.entryType
      : "usda",
  sourceId: typeof body.sourceId === "string" ? body.sourceId : null,
  quantity: typeof body.quantity === "number" ? body.quantity : undefined,
  name: typeof body.name === "string" ? body.name : undefined,
  servingLabel: typeof body.servingLabel === "string" ? body.servingLabel : undefined,
  calories: typeof body.calories === "number" ? body.calories : undefined,
  proteinGrams: typeof body.proteinGrams === "number" ? body.proteinGrams : undefined,
  carbsGrams: typeof body.carbsGrams === "number" ? body.carbsGrams : undefined,
  fatGrams: typeof body.fatGrams === "number" ? body.fatGrams : undefined,
  createdFromPlan: Boolean(body.createdFromPlan),
});

export const normalizeUpdateLogEntryPayload = (body: Record<string, unknown>): UpdateLogEntryRequest => ({
  quantity: typeof body.quantity === "number" ? body.quantity : undefined,
  mealSlotId: typeof body.mealSlotId === "string" ? body.mealSlotId : undefined,
  mealSlotLabel: typeof body.mealSlotLabel === "string" ? body.mealSlotLabel : undefined,
});

export const normalizeCustomFoodPayload = (body: Record<string, unknown>): CreateCustomFoodRequest => ({
  name: typeof body.name === "string" ? body.name : "",
  brandName: typeof body.brandName === "string" ? body.brandName : null,
  servingLabel: typeof body.servingLabel === "string" ? body.servingLabel : "",
  servingAmount: typeof body.servingAmount === "number" ? body.servingAmount : 1,
  calories: typeof body.calories === "number" ? body.calories : 0,
  proteinGrams: typeof body.proteinGrams === "number" ? body.proteinGrams : 0,
  carbsGrams: typeof body.carbsGrams === "number" ? body.carbsGrams : 0,
  fatGrams: typeof body.fatGrams === "number" ? body.fatGrams : 0,
  category:
    body.category === "protein" ||
    body.category === "carb" ||
    body.category === "fat" ||
    body.category === "fruit" ||
    body.category === "vegetable" ||
    body.category === "dairy" ||
    body.category === "mixed"
      ? body.category
      : "mixed",
});

export const normalizeRecipePayload = (body: Record<string, unknown>): CreateRecipeRequest => ({
  name: typeof body.name === "string" ? body.name : "",
  servings: typeof body.servings === "number" ? body.servings : 1,
  ingredients: Array.isArray(body.ingredients)
    ? body.ingredients
        .map((ingredient) => ingredient as Record<string, unknown>)
        .filter(Boolean)
        .map((ingredient) => ({
          itemType:
            ingredient.itemType === "usda" ||
            ingredient.itemType === "custom_food" ||
            ingredient.itemType === "recipe" ||
            ingredient.itemType === "saved_meal"
              ? ingredient.itemType
              : "custom_food",
          itemId: typeof ingredient.itemId === "string" ? ingredient.itemId : "",
          nameSnapshot: typeof ingredient.nameSnapshot === "string" ? ingredient.nameSnapshot : "",
          servingLabelSnapshot:
            typeof ingredient.servingLabelSnapshot === "string" ? ingredient.servingLabelSnapshot : "",
          quantity: typeof ingredient.quantity === "number" ? ingredient.quantity : 1,
          calories: typeof ingredient.calories === "number" ? ingredient.calories : 0,
          proteinGrams: typeof ingredient.proteinGrams === "number" ? ingredient.proteinGrams : 0,
          carbsGrams: typeof ingredient.carbsGrams === "number" ? ingredient.carbsGrams : 0,
          fatGrams: typeof ingredient.fatGrams === "number" ? ingredient.fatGrams : 0,
        }))
    : [],
});

export const normalizeSavedMealPayload = (body: Record<string, unknown>): CreateSavedMealRequest => ({
  name: typeof body.name === "string" ? body.name : "",
  slotSuggestionId: typeof body.slotSuggestionId === "string" ? body.slotSuggestionId : null,
  slotSuggestionLabel: typeof body.slotSuggestionLabel === "string" ? body.slotSuggestionLabel : null,
  items: Array.isArray(body.items)
    ? body.items.map((item) => {
        const payload = item as Record<string, unknown>;
        return {
          itemType:
            payload.itemType === "usda" ||
            payload.itemType === "custom_food" ||
            payload.itemType === "recipe" ||
            payload.itemType === "saved_meal"
              ? payload.itemType
              : "custom_food",
          sourceId: typeof payload.sourceId === "string" ? payload.sourceId : null,
          name: typeof payload.name === "string" ? payload.name : "",
          servingLabel: typeof payload.servingLabel === "string" ? payload.servingLabel : "",
          quantity: typeof payload.quantity === "number" ? payload.quantity : 1,
          calories: typeof payload.calories === "number" ? payload.calories : 0,
          proteinGrams: typeof payload.proteinGrams === "number" ? payload.proteinGrams : 0,
          carbsGrams: typeof payload.carbsGrams === "number" ? payload.carbsGrams : 0,
          fatGrams: typeof payload.fatGrams === "number" ? payload.fatGrams : 0,
        };
      })
    : [],
});

export const inferGoalLabel = (goal: NutritionGoal | null) => {
  if (goal === "lose") return "Cutting";
  if (goal === "gain") return "Bulking";
  return "Maintenance";
};
