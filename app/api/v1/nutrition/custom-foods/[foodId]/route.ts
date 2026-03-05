import { NextResponse } from "next/server";
import { getCustomFood, saveCustomFood } from "@/lib/nutrition-tracking-db";
import { normalizeCustomFoodPayload, toCustomFood, validateCustomFoodInput } from "@/lib/nutrition-tracking";
import { getAuthenticatedUid } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ foodId: string }> }) {
  try {
    const uid = await getAuthenticatedUid(request);
    const { foodId } = await params;
    const existing = await getCustomFood(uid, foodId);
    if (!existing) {
      return NextResponse.json({ message: "Custom food not found." }, { status: 404 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const payload = normalizeCustomFoodPayload(body);
    const validationError = validateCustomFoodInput(payload);
    if (validationError) {
      return NextResponse.json({ message: validationError }, { status: 400 });
    }
    const item = await saveCustomFood(uid, toCustomFood(uid, payload, existing.id, existing.createdAt));
    return NextResponse.json({ item });
  } catch (error) {
    console.error("PATCH /api/v1/nutrition/custom-foods/[foodId] failed", error);
    const message = error instanceof Error ? error.message : "Unable to update custom food.";
    const status = /token|bearer/i.test(message) ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
