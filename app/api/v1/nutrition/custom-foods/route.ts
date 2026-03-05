import { NextResponse } from "next/server";
import { listCustomFoods, saveCustomFood } from "@/lib/nutrition-tracking-db";
import { normalizeCustomFoodPayload, toCustomFood, validateCustomFoodInput } from "@/lib/nutrition-tracking";
import { getAuthenticatedUid } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const uid = await getAuthenticatedUid(request);
    const items = await listCustomFoods(uid);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/v1/nutrition/custom-foods failed", error);
    const message = error instanceof Error ? error.message : "Unable to load custom foods.";
    const status = /token|bearer/i.test(message) ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const uid = await getAuthenticatedUid(request);
    const body = (await request.json()) as Record<string, unknown>;
    const payload = normalizeCustomFoodPayload(body);
    const validationError = validateCustomFoodInput(payload);
    if (validationError) {
      return NextResponse.json({ message: validationError }, { status: 400 });
    }
    const item = await saveCustomFood(uid, toCustomFood(uid, payload));
    return NextResponse.json({ item });
  } catch (error) {
    console.error("POST /api/v1/nutrition/custom-foods failed", error);
    const message = error instanceof Error ? error.message : "Unable to create custom food.";
    const status = /token|bearer/i.test(message) ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
