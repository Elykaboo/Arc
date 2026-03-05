import { NextResponse } from "next/server";
import { listRecipes, saveRecipe } from "@/lib/nutrition-tracking-db";
import { normalizeRecipePayload, toRecipe, validateRecipeInput } from "@/lib/nutrition-tracking";
import { getAuthenticatedUid } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const uid = await getAuthenticatedUid(request);
    const items = await listRecipes(uid);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/v1/nutrition/recipes failed", error);
    const message = error instanceof Error ? error.message : "Unable to load recipes.";
    const status = /token|bearer/i.test(message) ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const uid = await getAuthenticatedUid(request);
    const body = (await request.json()) as Record<string, unknown>;
    const payload = normalizeRecipePayload(body);
    const validationError = validateRecipeInput(payload);
    if (validationError) {
      return NextResponse.json({ message: validationError }, { status: 400 });
    }
    const item = await saveRecipe(uid, toRecipe(uid, payload));
    return NextResponse.json({ item });
  } catch (error) {
    console.error("POST /api/v1/nutrition/recipes failed", error);
    const message = error instanceof Error ? error.message : "Unable to create recipe.";
    const status = /token|bearer/i.test(message) ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
