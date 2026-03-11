import { NextResponse } from "next/server";
import { searchCatalogFoods } from "@/lib/catalog-foods";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseQueryParams, v } from "@/lib/request-validation";

const foodsQuerySchema = v.object({
  search: v.string({ trim: true, maxLength: 120, optional: true }),
  category: v.enum(["protein", "carb", "fat", "fruit", "vegetable", "dairy", "mixed"], { optional: true }),
  mealTag: v.enum(["breakfast", "lunch", "dinner", "snack"], { optional: true }),
  limit: v.number({ integer: true, min: 1, max: 200, coerce: true, optional: true }),
});

export async function GET(request: Request) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-foods",
    scope: "read",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const query = parseQueryParams<{
      search?: string;
      category?: "protein" | "carb" | "fat" | "fruit" | "vegetable" | "dairy" | "mixed";
      mealTag?: "breakfast" | "lunch" | "dinner" | "snack";
      limit?: number;
    }>(request, foodsQuerySchema);

    const items = searchCatalogFoods({
      search: query.search,
      category: query.category,
      mealTag: query.mealTag,
      limit: query.limit,
    });
    return NextResponse.json({
      total: items.length,
      items,
    });
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: "Failed to load foods." }, { status: 502 });
  }
}
