import { NextResponse } from "next/server";
import { loadActiveNutritionPlan } from "@/lib/nutrition-db";
import {
  createOrUpdateNutritionPlan,
  normalizeNutritionRequest,
} from "@/lib/nutrition-service";
import { assertUserCanWrite, getAuthenticatedUid } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const uid = await getAuthenticatedUid(request);
    const plan = await loadActiveNutritionPlan(uid);
    if (!plan) {
      return NextResponse.json({ message: "No nutrition plan found." }, { status: 404 });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("GET /api/v1/nutrition/plan failed", error);
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = /token|bearer/i.test(message) ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const { uid } = await assertUserCanWrite(request);
    const body = (await request.json()) as Record<string, unknown>;
    const payload = normalizeNutritionRequest(body);
    const { plan } = await createOrUpdateNutritionPlan(uid, payload);
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("POST /api/v1/nutrition/plan failed", error);
    const message = error instanceof Error ? error.message : "Unable to create nutrition plan.";
    const status = /Invalid nutrition fields|Profile is incomplete/.test(message)
      ? 400
      : /token|bearer/i.test(message)
        ? 401
        : /suspended|forbidden/i.test(message)
          ? 403
        : 500;
    return NextResponse.json({ message }, { status });
  }
}
