import { NextResponse } from "next/server";
import { getRecipe, saveRecipe } from "@/lib/nutrition-tracking-db";
import { normalizeRecipePayload, toRecipe, validateRecipeInput } from "@/lib/nutrition-tracking";
import { assertUserCanWrite } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  try {
    const { uid } = await assertUserCanWrite(request);
    const { recipeId } = await params;
    const existing = await getRecipe(uid, recipeId);
    if (!existing) {
      return NextResponse.json({ message: "Recipe not found." }, { status: 404 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const payload = normalizeRecipePayload(body);
    const validationError = validateRecipeInput(payload);
    if (validationError) {
      return NextResponse.json({ message: validationError }, { status: 400 });
    }
    const item = await saveRecipe(uid, toRecipe(uid, payload, existing.id, existing.createdAt));
    return NextResponse.json({ item });
  } catch (error) {
    console.error("PATCH /api/v1/nutrition/recipes/[recipeId] failed", error);
    const message = error instanceof Error ? error.message : "Unable to update recipe.";
    const status = /token|bearer/i.test(message) ? 401 : /suspended|forbidden/i.test(message) ? 403 : 500;
    return NextResponse.json({ message }, { status });
  }
}
