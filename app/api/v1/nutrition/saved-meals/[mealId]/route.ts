import { NextResponse } from "next/server";
import { getSavedMeal, saveSavedMeal } from "@/lib/nutrition-tracking-db";
import { normalizeSavedMealPayload, toSavedMeal, validateSavedMealInput } from "@/lib/nutrition-tracking";
import { assertUserCanWrite } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ mealId: string }> }) {
  try {
    const { uid } = await assertUserCanWrite(request);
    const { mealId } = await params;
    const existing = await getSavedMeal(uid, mealId);
    if (!existing) {
      return NextResponse.json({ message: "Saved meal not found." }, { status: 404 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const payload = normalizeSavedMealPayload(body);
    const validationError = validateSavedMealInput(payload);
    if (validationError) {
      return NextResponse.json({ message: validationError }, { status: 400 });
    }
    const item = await saveSavedMeal(uid, toSavedMeal(uid, payload, existing.id, existing.createdAt));
    return NextResponse.json({ item });
  } catch (error) {
    console.error("PATCH /api/v1/nutrition/saved-meals/[mealId] failed", error);
    const message = error instanceof Error ? error.message : "Unable to update saved meal.";
    const status = /token|bearer/i.test(message) ? 401 : /suspended|forbidden/i.test(message) ? 403 : 500;
    return NextResponse.json({ message }, { status });
  }
}
