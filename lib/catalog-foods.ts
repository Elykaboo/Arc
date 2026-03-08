import burgerKingRaw from "@/data/foods/raw/BurgerKing_FoodDataSet.json";
import generalRaw from "@/data/foods/raw/General_FoodDataSet.json";
import jollibeeRaw from "@/data/foods/raw/Jollibee_FoodDataSet.json";
import kfcRaw from "@/data/foods/raw/KFC_FoodDataSet.json";
import mcDonaldsRaw from "@/data/foods/raw/McDonalds_FoodDataSet.json";
import { fallbackFoodCatalog } from "@/lib/food-catalog";
import type { FoodCatalogItem, FoodCategory, MealTag } from "@/types/nutrition";

type RawGeneralFood = {
  id?: string;
  name?: string;
  base_ingredient?: string;
  serving_basis?: string;
  macros?: {
    calories_kcal?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
  };
};

type RawGeneralDataset = {
  dataset_name?: string;
  foods?: RawGeneralFood[];
  total_foods?: number;
};

type RawRestaurantFood = {
  id?: string;
  restaurant?: string;
  item_name?: string;
  serving?: {
    description?: string;
    weight_g?: number;
  };
  macros?: {
    calories_kcal?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
  };
};

type SourceGroup = "general" | "jollibee" | "mcdonalds" | "kfc" | "burgerking";

type CatalogRecord = {
  item: FoodCatalogItem;
  sourceGroup: SourceGroup;
};

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ");

const classifyFood = ({
  name,
  protein,
  carbs,
  fat,
}: {
  name: string;
  protein: number;
  carbs: number;
  fat: number;
}): FoodCategory => {
  const value = name.toLowerCase();
  if (/(chicken|beef|pork|turkey|salmon|tuna|tofu|egg|protein|steak|ham|sausage|fish|shrimp)/.test(value)) {
    return "protein";
  }
  if (/(milk|yogurt|cheese|cottage|cream|butter)/.test(value)) return "dairy";
  if (/(rice|potato|oat|bread|pasta|noodle|fries|bun|cake|cookie|muffin|wrap|sandwich)/.test(value)) {
    return "carb";
  }
  if (/(olive oil|avocado|almond|peanut butter|nuts|seed)/.test(value)) return "fat";
  if (/(apple|banana|berries|orange|fruit|mango|pineapple|grape|melon)/.test(value)) return "fruit";
  if (/(broccoli|spinach|vegetable|lettuce|kale|cabbage|carrot|tomato|onion|pepper|kangkong)/.test(value)) {
    return "vegetable";
  }

  if (protein >= carbs * 1.2 && protein >= fat * 1.5 && protein >= 10) return "protein";
  if (fat >= carbs && fat >= protein && fat >= 10) return "fat";
  if (carbs >= protein && carbs >= fat && carbs >= 15) return "carb";
  return "mixed";
};

const inferMealTags = (name: string, category: FoodCategory): MealTag[] => {
  const value = name.toLowerCase();

  if (/(egg|oat|yogurt|bread|milk|banana|berries|pancake|waffle|cereal|coffee)/.test(value)) {
    return ["breakfast", "snack"];
  }

  if (/(burger|fries|chicken|beef|rice|pasta|noodle|wrap|sandwich|steak|salad|drumstick)/.test(value)) {
    return ["lunch", "dinner"];
  }

  if (/(protein|whey|bar|shake|cookie|dessert|fruit)/.test(value)) return ["snack"];

  if (category === "protein" || category === "carb" || category === "vegetable" || category === "dairy") {
    return ["lunch", "dinner"];
  }

  return ["snack"];
};

const servingLabelFromRestaurant = (entry: RawRestaurantFood) => {
  const description = entry.serving?.description?.trim() || "1 serving";
  const weight = toNumber(entry.serving?.weight_g, 0);
  return weight > 0 ? `${description} (${Math.round(weight)} g)` : description;
};

const normalizeRestaurantFood = (entry: RawRestaurantFood, sourceGroup: Exclude<SourceGroup, "general">): CatalogRecord | null => {
  const id = entry.id?.trim();
  const rawName = entry.item_name?.trim();
  if (!id || !rawName) return null;

  const calories = toNumber(entry.macros?.calories_kcal);
  const proteinGrams = toNumber(entry.macros?.protein_g);
  const carbsGrams = toNumber(entry.macros?.carbs_g);
  const fatGrams = toNumber(entry.macros?.fat_g);
  if (calories <= 0) return null;

  const name = normalizeName(rawName);
  const category = classifyFood({
    name,
    protein: proteinGrams,
    carbs: carbsGrams,
    fat: fatGrams,
  });

  return {
    sourceGroup,
    item: {
      source: "catalog",
      foodId: `catalog-${sourceGroup}-${id}`,
      name,
      category,
      servingLabel: servingLabelFromRestaurant(entry),
      calories: Math.round(calories),
      proteinGrams: Math.round(proteinGrams * 10) / 10,
      carbsGrams: Math.round(carbsGrams * 10) / 10,
      fatGrams: Math.round(fatGrams * 10) / 10,
      mealTags: inferMealTags(name, category),
      priority: 5,
    },
  };
};

const normalizeGeneralFood = (entry: RawGeneralFood): CatalogRecord | null => {
  const id = entry.id?.trim();
  const rawName = entry.name?.trim();
  if (!id || !rawName) return null;

  const calories = toNumber(entry.macros?.calories_kcal);
  const proteinGrams = toNumber(entry.macros?.protein_g);
  const carbsGrams = toNumber(entry.macros?.carbs_g);
  const fatGrams = toNumber(entry.macros?.fat_g);
  if (calories <= 0) return null;

  const name = normalizeName(rawName);
  const category = classifyFood({
    name,
    protein: proteinGrams,
    carbs: carbsGrams,
    fat: fatGrams,
  });

  return {
    sourceGroup: "general",
    item: {
      source: "catalog",
      foodId: `catalog-general-${id}`,
      name,
      category,
      servingLabel: entry.serving_basis?.trim() || "100g",
      calories: Math.round(calories),
      proteinGrams: Math.round(proteinGrams * 10) / 10,
      carbsGrams: Math.round(carbsGrams * 10) / 10,
      fatGrams: Math.round(fatGrams * 10) / 10,
      mealTags: inferMealTags(name, category),
      priority: 9,
    },
  };
};

const normalizeRestaurantDataset = (
  raw: unknown,
  sourceGroup: Exclude<SourceGroup, "general">,
): CatalogRecord[] => {
  const values = Array.isArray(raw) ? (raw as RawRestaurantFood[]) : [];
  return values
    .map((entry) => normalizeRestaurantFood(entry, sourceGroup))
    .filter((entry): entry is CatalogRecord => Boolean(entry));
};

const normalizeGeneralDataset = (raw: unknown): CatalogRecord[] => {
  const values = ((raw as RawGeneralDataset | undefined)?.foods ?? []) as RawGeneralFood[];
  return values
    .map(normalizeGeneralFood)
    .filter((entry): entry is CatalogRecord => Boolean(entry));
};

const normalizedCatalogRecords: CatalogRecord[] = [
  ...normalizeGeneralDataset(generalRaw),
  ...normalizeRestaurantDataset(jollibeeRaw, "jollibee"),
  ...normalizeRestaurantDataset(mcDonaldsRaw, "mcdonalds"),
  ...normalizeRestaurantDataset(kfcRaw, "kfc"),
  ...normalizeRestaurantDataset(burgerKingRaw, "burgerking"),
];

const normalizedCatalog = normalizedCatalogRecords
  .map((record) => record.item)
  .filter((item, index, list) => list.findIndex((candidate) => candidate.foodId === item.foodId) === index);

const planningCatalog = normalizedCatalogRecords
  .map((record) => record.item)
  .filter((item, index, list) => list.findIndex((candidate) => candidate.foodId === item.foodId) === index);

const searchMatchScore = (item: FoodCatalogItem, query: string) => {
  const name = item.name.toLowerCase();
  const queryValue = query.toLowerCase();
  const sourceGroup = item.foodId.split("-")[1] ?? "";
  const sourceTerms =
    sourceGroup === "jollibee"
      ? ["jollibee", "jabee"]
      : sourceGroup === "mcdonalds"
        ? ["mcdonalds", "mcdonald", "mcdo"]
        : sourceGroup === "kfc"
          ? ["kfc"]
          : sourceGroup === "burgerking"
            ? ["burgerking", "burger king", "bk"]
            : sourceGroup === "general"
              ? ["general"]
              : [];
  if (!queryValue) return item.priority;
  if (sourceTerms.some((term) => term === queryValue || term.includes(queryValue) || queryValue.includes(term))) {
    return 900 + item.priority;
  }
  if (name === queryValue) return 1000 + item.priority;
  if (name.startsWith(queryValue)) return 700 + item.priority;
  if (name.includes(queryValue)) return 450 + item.priority;
  return -1;
};

export const searchCatalogFoods = ({
  search,
  category,
  mealTag,
  limit,
}: {
  search?: string;
  category?: string;
  mealTag?: string;
  limit?: number;
}): FoodCatalogItem[] => {
  const query = search?.trim() || "";
  const maxItems = limit && limit > 0 ? limit : 25;
  const source = normalizedCatalog.length > 0 ? normalizedCatalog : fallbackFoodCatalog;

  return source
    .filter((item) => {
      const score = searchMatchScore(item, query);
      if (query && score < 0) return false;
      if (category && item.category !== category) return false;
      if (mealTag && !item.mealTags.includes(mealTag as MealTag)) return false;
      return true;
    })
    .sort((left, right) => {
      const scoreDelta = searchMatchScore(right, query) - searchMatchScore(left, query);
      if (scoreDelta !== 0) return scoreDelta;
      return right.priority - left.priority;
    })
    .slice(0, maxItems);
};

export const buildPlanningCatalog = async (): Promise<FoodCatalogItem[]> => {
  if (planningCatalog.length === 0) return fallbackFoodCatalog;
  return planningCatalog;
};

export const hasExternalCatalogData = () => normalizedCatalog.length > 0;
