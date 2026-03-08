import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { loadActiveNutritionPlan } from "@/lib/nutrition-db";
import {
  buildEmptyDailyLog,
  buildLogEntryFromSearchResult,
  foodToSearchResult,
  mergeFrequentResults,
  mergeRecentResults,
  normalizeLegacyLibraryItemType,
  normalizeMealSlots,
  planFoodToSearchResult,
  recalculateDailyLog,
  recipeToSearchResult,
  resolveDefaultMealSetup,
  savedMealToSearchResult,
  toDashboardResponse,
  validateMealSetup,
} from "@/lib/nutrition-tracking";
import { searchCatalogFoods } from "@/lib/catalog-foods";
import type {
  ActiveNutritionPlan,
  CreateLogEntryRequest,
  CustomFood,
  DailyNutritionLog,
  LoggedFoodEntry,
  MealSetup,
  MealSlotConfig,
  NutritionDashboardResponse,
  Recipe,
  SavedMeal,
  UpdateLogEntryRequest,
} from "@/types/nutrition";

type FirestoreTimestamped = {
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
};

const userCollection = async (uid: string, name: string) => (await getAdminDb()).collection("users").doc(uid).collection(name);
const mealSetupDoc = async (uid: string) => ((await userCollection(uid, "nutrition")).doc("mealSetup"));
const dailyLogDoc = async (uid: string, date: string) => ((await userCollection(uid, "nutritionLogs")).doc(date));
const customFoodCollection = async (uid: string) => userCollection(uid, "customFoods");
const recipeCollection = async (uid: string) => userCollection(uid, "recipes");
const savedMealCollection = async (uid: string) => userCollection(uid, "savedMeals");
const roundToTenth = (value: number) => Math.round(value * 10) / 10;
const sameMacroTargets = (
  left: { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number },
  right: { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number },
) =>
  roundToTenth(left.calories) === roundToTenth(right.calories) &&
  roundToTenth(left.proteinGrams) === roundToTenth(right.proteinGrams) &&
  roundToTenth(left.carbsGrams) === roundToTenth(right.carbsGrams) &&
  roundToTenth(left.fatGrams) === roundToTenth(right.fatGrams);

const serializeTimestamp = (value?: Timestamp | string): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value.toDate().toISOString();
};

const parseMealSetup = (uid: string, data: Record<string, unknown> | undefined): MealSetup | null => {
  if (!data) return null;
  const rawSlots = Array.isArray(data.slots) ? (data.slots as MealSlotConfig[]) : [];
  if (rawSlots.length === 0) return null;
  return {
    uid,
    slots: normalizeMealSlots(rawSlots),
    updatedAt: serializeTimestamp(data.updatedAt as Timestamp | undefined),
  };
};

const parseDailyLog = (uid: string, date: string, data: Record<string, unknown> | undefined): DailyNutritionLog | null => {
  if (!data) return null;
  const raw = data as DailyNutritionLog & FirestoreTimestamped;
  const log = {
    ...raw,
    meals: (raw.meals ?? []).map((meal) => ({
      ...meal,
      entries: (meal.entries ?? []).map((entry) => ({
        ...entry,
        entryType: normalizeLegacyLibraryItemType(entry.entryType),
      })),
    })),
    uid,
    date,
    updatedAt: serializeTimestamp((data as FirestoreTimestamped).updatedAt),
  };
  return recalculateDailyLog(log);
};

const parseListDocs = <T extends { createdAt?: string; updatedAt?: string }>(
  docs: FirebaseFirestore.QuerySnapshot["docs"],
): T[] =>
  docs.map((document) => {
    const data = document.data() as T & FirestoreTimestamped;
    return {
      ...data,
      createdAt: serializeTimestamp(data.createdAt) ?? new Date(0).toISOString(),
      updatedAt: serializeTimestamp(data.updatedAt) ?? new Date(0).toISOString(),
    };
  });

export const loadMealSetup = async (uid: string, fallbackMealsPerDay?: number | null): Promise<MealSetup> => {
  const snapshot = await (await mealSetupDoc(uid)).get();
  return resolveDefaultMealSetup({
    uid,
    mealsPerDay: fallbackMealsPerDay,
    existing: parseMealSetup(uid, snapshot.data() as Record<string, unknown> | undefined),
  });
};

export const saveMealSetup = async (uid: string, slots: MealSlotConfig[], activeLog?: DailyNutritionLog | null): Promise<MealSetup> => {
  const normalized = normalizeMealSlots(slots);
  const validationError = validateMealSetup(normalized);
  if (validationError) throw new Error(validationError);

  if (activeLog) {
    const occupied = activeLog.meals.filter((meal) => meal.entries.length > 0);
    const removed = occupied.filter((meal) => !normalized.some((slot) => slot.id === meal.slotId));
    if (removed.length > 0) {
      throw new Error("Reassign or remove logged entries before deleting a meal slot.");
    }
  }

  await (await mealSetupDoc(uid)).set(
    {
      uid,
      slots: normalized,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    uid,
    slots: normalized,
    updatedAt: new Date().toISOString(),
  };
};

export const listCustomFoods = async (uid: string): Promise<CustomFood[]> => {
  const snapshot = await (await customFoodCollection(uid)).get();
  return parseListDocs<CustomFood>(snapshot.docs).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const saveCustomFood = async (uid: string, food: CustomFood): Promise<CustomFood> => {
  await (await customFoodCollection(uid)).doc(food.id).set(
    {
      ...food,
      createdAt: food.createdAt,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ...food, updatedAt: new Date().toISOString() };
};

export const getCustomFood = async (uid: string, foodId: string): Promise<CustomFood | null> => {
  const snapshot = await (await customFoodCollection(uid)).doc(foodId).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as CustomFood & FirestoreTimestamped;
  return {
    ...data,
    createdAt: serializeTimestamp(data.createdAt) ?? new Date().toISOString(),
    updatedAt: serializeTimestamp(data.updatedAt) ?? new Date().toISOString(),
  };
};

export const listRecipes = async (uid: string): Promise<Recipe[]> => {
  const snapshot = await (await recipeCollection(uid)).get();
  return parseListDocs<Recipe>(snapshot.docs).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const saveRecipe = async (uid: string, recipe: Recipe): Promise<Recipe> => {
  await (await recipeCollection(uid)).doc(recipe.id).set(
    {
      ...recipe,
      createdAt: recipe.createdAt,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ...recipe, updatedAt: new Date().toISOString() };
};

export const getRecipe = async (uid: string, recipeId: string): Promise<Recipe | null> => {
  const snapshot = await (await recipeCollection(uid)).doc(recipeId).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as Recipe & FirestoreTimestamped;
  return {
    ...data,
    createdAt: serializeTimestamp(data.createdAt) ?? new Date().toISOString(),
    updatedAt: serializeTimestamp(data.updatedAt) ?? new Date().toISOString(),
  };
};

export const listSavedMeals = async (uid: string): Promise<SavedMeal[]> => {
  const snapshot = await (await savedMealCollection(uid)).get();
  return parseListDocs<SavedMeal>(snapshot.docs).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const saveSavedMeal = async (uid: string, meal: SavedMeal): Promise<SavedMeal> => {
  await (await savedMealCollection(uid)).doc(meal.id).set(
    {
      ...meal,
      createdAt: meal.createdAt,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ...meal, updatedAt: new Date().toISOString() };
};

export const getSavedMeal = async (uid: string, mealId: string): Promise<SavedMeal | null> => {
  const snapshot = await (await savedMealCollection(uid)).doc(mealId).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as SavedMeal & FirestoreTimestamped;
  return {
    ...data,
    createdAt: serializeTimestamp(data.createdAt) ?? new Date().toISOString(),
    updatedAt: serializeTimestamp(data.updatedAt) ?? new Date().toISOString(),
  };
};

export const loadDailyNutritionLog = async ({
  uid,
  date,
  mealSetup,
  plan,
}: {
  uid: string;
  date: string;
  mealSetup: MealSetup;
  plan: ActiveNutritionPlan | null;
}): Promise<DailyNutritionLog> => {
  const snapshot = await (await dailyLogDoc(uid, date)).get();
  const existing = parseDailyLog(uid, date, snapshot.data() as Record<string, unknown> | undefined);
  if (existing) {
    return recalculateDailyLog(existing, mealSetup);
  }

  return buildEmptyDailyLog({
    uid,
    date,
    targets: plan?.targets ?? { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
    mealSetup,
  });
};

export const saveDailyNutritionLog = async (uid: string, log: DailyNutritionLog): Promise<DailyNutritionLog> => {
  const resolved = recalculateDailyLog(log);
  await (await dailyLogDoc(uid, log.date)).set(
    {
      ...resolved,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ...resolved, updatedAt: new Date().toISOString() };
};

const flattenLogEntries = (logs: DailyNutritionLog[]) => logs.flatMap((log) => log.meals.flatMap((meal) => meal.entries));

const loadRecentLogs = async (uid: string): Promise<DailyNutritionLog[]> => {
  const snapshot = await (await userCollection(uid, "nutritionLogs")).get();
  const docs = snapshot.docs
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, 14);

  return docs
    .map((document) => parseDailyLog(uid, document.id, document.data() as Record<string, unknown>))
    .filter((log): log is DailyNutritionLog => Boolean(log));
};

export const buildNutritionDashboard = async ({
  uid,
  date,
  mealsPerDay,
}: {
  uid: string;
  date: string;
  mealsPerDay?: number | null;
}): Promise<NutritionDashboardResponse> => {
  const [plan, customFoods, recipes, savedMeals] = await Promise.all([
    loadActiveNutritionPlan(uid),
    listCustomFoods(uid),
    listRecipes(uid),
    listSavedMeals(uid),
  ]);

  const mealSetup = await loadMealSetup(uid, mealsPerDay ?? plan?.mealsPerDay);
  let log = await loadDailyNutritionLog({ uid, date, mealSetup, plan });

  // Keep today's dashboard targets aligned with the latest generated nutrition plan.
  if (plan && !sameMacroTargets(log.targetSnapshot, plan.targets)) {
    log = await saveDailyNutritionLog(uid, {
      ...log,
      targetSnapshot: plan.targets,
    });
  }

  const recentLogs = await loadRecentLogs(uid);
  const historicalEntries = flattenLogEntries(recentLogs);

  return toDashboardResponse({
    date,
    mealSetup,
    log,
    plan,
    recentItems: mergeRecentResults(historicalEntries),
    frequentItems: mergeFrequentResults(historicalEntries),
    customFoods,
    recipes,
    savedMeals,
  });
};

const buildEntriesFromPayload = async ({
  uid,
  payload,
  mealSetup,
  plan,
}: {
  uid: string;
  payload: CreateLogEntryRequest;
  mealSetup: MealSetup;
  plan: ActiveNutritionPlan | null;
}): Promise<LoggedFoodEntry[]> => {
  const slot = mealSetup.slots.find((candidate) => candidate.id === payload.mealSlotId);
  if (!slot) throw new Error("Selected meal slot no longer exists.");

  if (!payload.sourceId && !payload.name) {
    throw new Error("Log entry is missing a source item.");
  }

  if (
    payload.name &&
    payload.servingLabel &&
    payload.calories !== undefined &&
    payload.proteinGrams !== undefined &&
    payload.carbsGrams !== undefined &&
    payload.fatGrams !== undefined
  ) {
    return [buildLogEntryFromSearchResult({
      item: {
        id: `manual-${payload.name}`,
        itemType: payload.entryType,
        sourceId: payload.sourceId ?? null,
        name: payload.name,
        subtitle: "Manual",
        servingLabel: payload.servingLabel,
        calories: payload.calories,
        proteinGrams: payload.proteinGrams,
        carbsGrams: payload.carbsGrams,
        fatGrams: payload.fatGrams,
      },
      mealSlotId: slot.id,
      mealSlotLabel: slot.label,
      quantity: payload.quantity,
      createdFromPlan: payload.createdFromPlan,
    })];
  }

  if (payload.entryType === "custom_food" && payload.sourceId) {
    const food = await getCustomFood(uid, payload.sourceId);
    if (!food) throw new Error("Custom food not found.");
    return [buildLogEntryFromSearchResult({
      item: foodToSearchResult(food),
      mealSlotId: slot.id,
      mealSlotLabel: slot.label,
      quantity: payload.quantity,
      createdFromPlan: payload.createdFromPlan,
    })];
  }

  if (payload.entryType === "recipe" && payload.sourceId) {
    const recipe = await getRecipe(uid, payload.sourceId);
    if (!recipe) throw new Error("Recipe not found.");
    return [buildLogEntryFromSearchResult({
      item: recipeToSearchResult(recipe),
      mealSlotId: slot.id,
      mealSlotLabel: slot.label,
      quantity: payload.quantity,
      createdFromPlan: payload.createdFromPlan,
    })];
  }

  if (payload.entryType === "saved_meal" && payload.sourceId) {
    const savedMeal = await getSavedMeal(uid, payload.sourceId);
    if (!savedMeal) throw new Error("Saved meal not found.");
    const quantity = Math.max(0.1, payload.quantity ?? 1);
    return savedMeal.items.map((item, index) =>
      buildLogEntryFromSearchResult({
        item: {
          ...savedMealToSearchResult(savedMeal),
          id: `saved-meal-${savedMeal.id}-${index}`,
          itemType: normalizeLegacyLibraryItemType(item.itemType),
          sourceId: item.sourceId,
          name: item.name,
          subtitle: savedMeal.name,
          servingLabel: item.servingLabel,
          calories: item.calories,
          proteinGrams: item.proteinGrams,
          carbsGrams: item.carbsGrams,
          fatGrams: item.fatGrams,
        },
        mealSlotId: slot.id,
        mealSlotLabel: slot.label,
        quantity,
        createdFromPlan: payload.createdFromPlan,
      }),
    );
  }

  if (payload.entryType === "planned_food" && payload.sourceId && plan) {
    for (const meal of plan.meals) {
      const food = meal.foods.find((item) => item.foodId === payload.sourceId);
      if (!food) continue;
      return [buildLogEntryFromSearchResult({
        item: planFoodToSearchResult({ planSlot: meal.slot, planLabel: meal.label, food }),
        mealSlotId: slot.id,
        mealSlotLabel: slot.label,
        quantity: payload.quantity,
        createdFromPlan: true,
      })];
    }
  }

  if (
    (payload.entryType === "catalog" || payload.entryType === "usda" || payload.entryType === "planned_food") &&
    payload.sourceId
  ) {
    const results = searchCatalogFoods({ search: payload.name || payload.sourceId, limit: 15 });
    const found = results.find((item) => item.foodId === payload.sourceId || item.name === payload.name);
    if (!found) throw new Error("Food not found.");
    return [buildLogEntryFromSearchResult({
      item: {
        id: found.foodId,
        itemType: "catalog",
        sourceId: found.foodId,
        name: found.name,
        subtitle: "Food database",
        servingLabel: found.servingLabel,
        calories: found.calories,
        proteinGrams: found.proteinGrams,
        carbsGrams: found.carbsGrams,
        fatGrams: found.fatGrams,
      },
      mealSlotId: slot.id,
      mealSlotLabel: slot.label,
      quantity: payload.quantity,
      createdFromPlan: payload.createdFromPlan,
    })];
  }

  throw new Error("Unsupported log entry payload.");
};

export const addLogEntry = async ({
  uid,
  date,
  payload,
  mealsPerDay,
}: {
  uid: string;
  date: string;
  payload: CreateLogEntryRequest;
  mealsPerDay?: number | null;
}): Promise<DailyNutritionLog> => {
  const plan = await loadActiveNutritionPlan(uid);
  const mealSetup = await loadMealSetup(uid, mealsPerDay ?? plan?.mealsPerDay);
  const log = await loadDailyNutritionLog({ uid, date, mealSetup, plan });
  const entries = await buildEntriesFromPayload({ uid, payload, mealSetup, plan });
  const next = {
    ...log,
    meals: log.meals.map((meal) =>
      meal.slotId === payload.mealSlotId ? { ...meal, entries: [...meal.entries, ...entries] } : meal,
    ),
  };
  return saveDailyNutritionLog(uid, next);
};

export const updateLogEntry = async ({
  uid,
  date,
  entryId,
  payload,
  mealsPerDay,
}: {
  uid: string;
  date: string;
  entryId: string;
  payload: UpdateLogEntryRequest;
  mealsPerDay?: number | null;
}): Promise<DailyNutritionLog> => {
  const plan = await loadActiveNutritionPlan(uid);
  const mealSetup = await loadMealSetup(uid, mealsPerDay ?? plan?.mealsPerDay);
  const log = await loadDailyNutritionLog({ uid, date, mealSetup, plan });

  let found: LoggedFoodEntry | null = null;
  let currentSlotId = "";
  for (const meal of log.meals) {
    const match = meal.entries.find((entry) => entry.id === entryId);
    if (match) {
      found = match;
      currentSlotId = meal.slotId;
      break;
    }
  }
  if (!found) throw new Error("Log entry not found.");

  const targetSlotId = payload.mealSlotId ?? currentSlotId;
  const targetSlot = mealSetup.slots.find((slot) => slot.id === targetSlotId);
  if (!targetSlot) throw new Error("Selected meal slot no longer exists.");

  const ratio = (payload.quantity ?? found.quantity) / Math.max(found.quantity, 0.1);
  const updatedEntry: LoggedFoodEntry = {
    ...found,
    quantity: Math.max(0.1, roundToTenth(payload.quantity ?? found.quantity)),
    mealSlotId: targetSlot.id,
    mealSlotLabelSnapshot: payload.mealSlotLabel?.trim() || targetSlot.label,
    calories: roundToTenth(found.calories * ratio),
    proteinGrams: roundToTenth(found.proteinGrams * ratio),
    carbsGrams: roundToTenth(found.carbsGrams * ratio),
    fatGrams: roundToTenth(found.fatGrams * ratio),
  };

  const nextMeals = log.meals.map((meal) => {
    const remaining = meal.entries.filter((entry) => entry.id !== entryId);
    if (meal.slotId === targetSlotId) {
      return { ...meal, entries: [...remaining, updatedEntry] };
    }
    return { ...meal, entries: remaining };
  });

  if (!nextMeals.some((meal) => meal.slotId === targetSlotId && meal.entries.some((entry) => entry.id === entryId))) {
    const targetMeal = nextMeals.find((meal) => meal.slotId === targetSlotId);
    if (targetMeal) targetMeal.entries.push(updatedEntry);
  }

  return saveDailyNutritionLog(uid, { ...log, meals: nextMeals });
};

export const deleteLogEntry = async ({
  uid,
  date,
  entryId,
  mealsPerDay,
}: {
  uid: string;
  date: string;
  entryId: string;
  mealsPerDay?: number | null;
}): Promise<DailyNutritionLog> => {
  const plan = await loadActiveNutritionPlan(uid);
  const mealSetup = await loadMealSetup(uid, mealsPerDay ?? plan?.mealsPerDay);
  const log = await loadDailyNutritionLog({ uid, date, mealSetup, plan });
  const next = {
    ...log,
    meals: log.meals.map((meal) => ({
      ...meal,
      entries: meal.entries.filter((entry) => entry.id !== entryId),
    })),
  };
  return saveDailyNutritionLog(uid, next);
};
