import { NextResponse } from "next/server";
import {
  listCustomFoods,
  listRecipes,
  listSavedMeals,
  loadMealSetup,
} from "@/lib/nutrition-tracking-db";
import {
  coerceDateKey,
  foodToSearchResult,
  normalizePlanSuggestions,
  normalizeUsdaSearchResult,
  recipeToSearchResult,
  savedMealToSearchResult,
} from "@/lib/nutrition-tracking";
import { loadActiveNutritionPlan } from "@/lib/nutrition-db";
import { loadServerUserProfile } from "@/lib/server-profile-db";
import { getAuthenticatedUid } from "@/lib/server-auth";
import { searchFoodsWithFallback } from "@/lib/usda-foods";
import type { NutritionSearchResult } from "@/types/nutrition";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const uid = await getAuthenticatedUid(request);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query")?.trim() || "";
    const scope = searchParams.get("scope") || "all";
    const profile = await loadServerUserProfile(uid);
    const plan = await loadActiveNutritionPlan(uid);
    await loadMealSetup(uid, profile?.mealsPerDay ?? plan?.mealsPerDay ?? null);

    const [usdaResults, customFoods, recipes, savedMeals] = await Promise.all([
      scope === "all" || scope === "foods" ? searchFoodsWithFallback({ search: query, limit: 12 }) : Promise.resolve([]),
      listCustomFoods(uid),
      listRecipes(uid),
      listSavedMeals(uid),
    ]);

    const matches = (value: string) => !query || value.toLowerCase().includes(query.toLowerCase());
    const items: NutritionSearchResult[] = [];

    if (scope === "all" || scope === "foods") {
      items.push(...usdaResults.map(normalizeUsdaSearchResult));
      items.push(...customFoods.filter((item) => matches(item.name)).map(foodToSearchResult));
    }
    if (scope === "all" || scope === "recipes") {
      items.push(...recipes.filter((item) => matches(item.name)).map(recipeToSearchResult));
    }
    if (scope === "all" || scope === "meals") {
      items.push(...savedMeals.filter((item) => matches(item.name)).map(savedMealToSearchResult));
    }

    if (scope === "all" && plan) {
      for (const suggestion of normalizePlanSuggestions(plan)) {
        items.push(...suggestion.foods.filter((item) => matches(item.name)));
      }
    }

    const deduped = items.filter(
      (item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index,
    );
    return NextResponse.json({
      date: coerceDateKey(searchParams.get("date")),
      items: deduped.slice(0, 30),
      total: deduped.length,
    });
  } catch (error) {
    console.error("GET /api/v1/nutrition/search failed", error);
    const message = error instanceof Error ? error.message : "Unable to search.";
    const status = /token|bearer/i.test(message) ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
