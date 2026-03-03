import { NextResponse } from "next/server";
import { regenerateNutritionPlan } from "@/lib/nutrition-service";
import { getAuthenticatedUid } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const uid = await getAuthenticatedUid(request);
    const plan = await regenerateNutritionPlan(uid);
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("POST /api/v1/nutrition/plan/regenerate failed", error);
    const message = error instanceof Error ? error.message : "Unable to regenerate meal plan.";
    const status = /Profile is incomplete/.test(message) ? 400 : /token|bearer/i.test(message) ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
