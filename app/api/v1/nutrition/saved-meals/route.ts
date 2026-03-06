import { NextResponse } from "next/server";
import { listSavedMeals, saveSavedMeal } from "@/lib/nutrition-tracking-db";
import { normalizeSavedMealPayload, toSavedMeal, validateSavedMealInput } from "@/lib/nutrition-tracking";
import { assertUserCanWrite, getAuthenticatedUid } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const uid = await getAuthenticatedUid(request);
    const items = await listSavedMeals(uid);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/v1/nutrition/saved-meals failed", error);
    const message = error instanceof Error ? error.message : "Unable to load saved meals.";
    const status = /token|bearer/i.test(message) ? 401 : /suspended|forbidden/i.test(message) ? 403 : 500;
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const { uid } = await assertUserCanWrite(request);
    const body = (await request.json()) as Record<string, unknown>;
    const payload = normalizeSavedMealPayload(body);
    const validationError = validateSavedMealInput(payload);
    if (validationError) {
      return NextResponse.json({ message: validationError }, { status: 400 });
    }
    const item = await saveSavedMeal(uid, toSavedMeal(uid, payload));
    return NextResponse.json({ item });
  } catch (error) {
    console.error("POST /api/v1/nutrition/saved-meals failed", error);
    const message = error instanceof Error ? error.message : "Unable to create saved meal.";
    const status = /token|bearer/i.test(message) ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
