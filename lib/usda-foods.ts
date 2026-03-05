import { fallbackFoodCatalog, searchFallbackFoods } from "@/lib/food-catalog";
import type { FoodCatalogItem, MealTag, UsdaFoodItem } from "@/types/nutrition";

type UsdaSearchFood = {
  fdcId?: number;
  description?: string;
  dataType?: string;
  brandOwner?: string;
  foodNutrients?: Array<{
    nutrientName?: string;
    value?: number;
  }>;
};

type UsdaSearchResponse = {
  foods?: UsdaSearchFood[];
};

const USDA_BASE_URL = process.env.USDA_API_BASE_URL?.trim() || "https://api.nal.usda.gov/fdc/v1";

const nutrientValue = (food: UsdaSearchFood, name: string): number => {
  const entry = food.foodNutrients?.find(
    (item) => item.nutrientName?.toLowerCase() === name.toLowerCase(),
  );
  return typeof entry?.value === "number" && Number.isFinite(entry.value) ? entry.value : 0;
};

const classifyFood = (name: string): FoodCatalogItem["category"] => {
  const value = name.toLowerCase();
  if (/(chicken|beef|salmon|tuna|tofu|egg|yogurt|protein|cottage cheese|milk)/.test(value)) return "protein";
  if (/(rice|potato|oat|bread|pasta)/.test(value)) return "carb";
  if (/(olive oil|avocado|almond|peanut butter)/.test(value)) return "fat";
  if (/(apple|banana|berries|fruit)/.test(value)) return "fruit";
  if (/(broccoli|spinach|vegetable|lettuce|kale)/.test(value)) return "vegetable";
  return "mixed";
};

const inferMealTags = (name: string): MealTag[] => {
  const value = name.toLowerCase();
  if (/(egg|oat|yogurt|bread|milk|banana|berries)/.test(value)) return ["breakfast", "snack"];
  if (/(almond|apple|protein|whey|cottage cheese)/.test(value)) return ["snack"];
  if (/(chicken|beef|salmon|tuna|tofu|rice|potato|pasta|broccoli|spinach|vegetable)/.test(value)) {
    return ["lunch", "dinner"];
  }
  return ["snack"];
};

export const normalizeUsdaFood = (food: UsdaSearchFood): UsdaFoodItem | null => {
  if (typeof food.fdcId !== "number" || !food.description?.trim()) return null;

  const calories = nutrientValue(food, "Energy");
  const proteinGrams = nutrientValue(food, "Protein");
  const carbsGrams = nutrientValue(food, "Carbohydrate, by difference");
  const fatGrams = nutrientValue(food, "Total lipid (fat)");
  if (calories <= 0) return null;

  const normalizedName = food.description.trim();
  return {
    source: "usda",
    foodId: `usda-${food.fdcId}`,
    fdcId: food.fdcId,
    dataType: food.dataType?.trim() || "Unknown",
    brandOwner: food.brandOwner?.trim() || undefined,
    name: normalizedName,
    category: classifyFood(normalizedName),
    servingLabel: "100 g",
    calories: Math.round(calories),
    proteinGrams: Math.round(proteinGrams),
    carbsGrams: Math.round(carbsGrams),
    fatGrams: Math.round(fatGrams),
    mealTags: inferMealTags(normalizedName),
    priority: /foundation|sr legacy/i.test(food.dataType || "") ? 10 : 6,
  };
};

export const searchUsdaFoods = async (query: string, limit = 10): Promise<UsdaFoodItem[]> => {
  const apiKey = process.env.USDA_API_KEY?.trim();
  if (!apiKey || !query.trim()) return [];

  const response = await fetch(`${USDA_BASE_URL}/foods/search?api_key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      pageSize: limit,
      requireAllWords: false,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`USDA search failed with status ${response.status}`);
  }

  const data = (await response.json()) as UsdaSearchResponse;
  return (data.foods ?? [])
    .map(normalizeUsdaFood)
    .filter((item): item is UsdaFoodItem => Boolean(item))
    .sort((left, right) => right.priority - left.priority);
};

export const searchFoodsWithFallback = async ({
  search,
  category,
  mealTag,
  limit,
}: {
  search?: string;
  category?: string;
  mealTag?: string;
  limit?: number;
}): Promise<FoodCatalogItem[]> => {
  const maxItems = limit && limit > 0 ? limit : 25;
  const query = search?.trim() || "";

  try {
    const usdaItems = query ? await searchUsdaFoods(query, maxItems) : [];
    const filteredUsda = usdaItems.filter((item) => {
      if (category && item.category !== category) return false;
      if (mealTag && !item.mealTags.includes(mealTag as MealTag)) return false;
      return true;
    });

    if (filteredUsda.length >= Math.min(6, maxItems)) {
      return filteredUsda.slice(0, maxItems);
    }

    const fallback = searchFallbackFoods({ search, category, mealTag, limit: maxItems });
    const seen = new Set(filteredUsda.map((item) => item.foodId));
    return [...filteredUsda, ...fallback.filter((item) => !seen.has(item.foodId))].slice(0, maxItems);
  } catch {
    return searchFallbackFoods({ search, category, mealTag, limit: maxItems });
  }
};

export const buildPlanningCatalog = async (): Promise<FoodCatalogItem[]> => {
  const apiKey = process.env.USDA_API_KEY?.trim();
  if (!apiKey) {
    return fallbackFoodCatalog;
  }

  const isOutlierName = (name: string) =>
    /(dehydrated|dried|powder|concentrate|sweetened|syrup|mix|formula|meal replacement)/i.test(name);

  const scoreCandidate = (fallback: FoodCatalogItem, candidate: FoodCatalogItem) => {
    const fallbackName = fallback.name.toLowerCase();
    const candidateName = candidate.name.toLowerCase();

    let score = 0;
    if (candidate.category === fallback.category) score += 80;
    if (candidateName.includes(fallbackName) || fallbackName.includes(candidateName)) score += 50;
    if (/(raw|fresh|plain|cooked|boiled|baked|roasted)/i.test(candidate.name)) score += 15;
    if (isOutlierName(candidate.name)) score -= 180;

    // Prefer nutrient profiles near the known local fallback baseline.
    score -= Math.abs(candidate.calories - fallback.calories) * 1.2;
    score -= Math.abs(candidate.proteinGrams - fallback.proteinGrams) * 3;
    score -= Math.abs(candidate.carbsGrams - fallback.carbsGrams) * 2;
    score -= Math.abs(candidate.fatGrams - fallback.fatGrams) * 2;

    return score;
  };

  const normalizedFoods = await Promise.all(
    fallbackFoodCatalog.map(async (fallback) => {
      try {
        const usdaResults = await searchUsdaFoods(fallback.name, 4);
        if (usdaResults.length === 0) return fallback;

        const ranked = [...usdaResults]
          .filter((candidate) => !isOutlierName(candidate.name))
          .sort((left, right) => scoreCandidate(fallback, right) - scoreCandidate(fallback, left));

        const match = ranked[0] ?? usdaResults.sort((left, right) => scoreCandidate(fallback, right) - scoreCandidate(fallback, left))[0];
        return match ?? fallback;
      } catch {
        return fallback;
      }
    }),
  );

  return normalizedFoods;
};
