import { NextResponse } from "next/server";
import { coerceDateKey } from "@/lib/nutrition-tracking";
import { loadDailyNutritionLog, loadMealSetup, saveMealSetup } from "@/lib/nutrition-tracking-db";
import { loadActiveNutritionPlan } from "@/lib/nutrition-db";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseJsonBody, v } from "@/lib/request-validation";
import { loadServerUserProfile } from "@/lib/server-profile-db";
import { assertUserCanWrite, getAuthenticatedUid } from "@/lib/server-auth";
import type { MealSlotConfig } from "@/types/nutrition";

export const runtime = "nodejs";

type SaveMealSetupBody = {
  date?: string;
  slots?: MealSlotConfig[];
};

const bodySchema = v.object({
  date: v.string({ trim: true, pattern: /^\d{4}-\d{2}-\d{2}$/, optional: true }),
  slots: v.array(
    v.object({
      id: v.string({ trim: true, minLength: 1, maxLength: 48 }),
      label: v.string({ trim: true, minLength: 1, maxLength: 40 }),
      position: v.number({ integer: true, min: 0, max: 12 }),
    }),
    { minItems: 1, maxItems: 8, optional: true },
  ),
});

export async function GET(request: Request) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-nutrition-meal-setup-get",
    scope: "read",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const uid = await getAuthenticatedUid(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "v1-nutrition-meal-setup-get",
      uid,
      scope: "read",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const profile = await loadServerUserProfile(uid);
    const setup = await loadMealSetup(uid, profile?.mealsPerDay ?? null);
    return NextResponse.json(setup);
  } catch (error) {
    console.error("GET /api/v1/nutrition/meal-setup failed", error);
    const message = error instanceof Error ? error.message : "Unable to load meal setup.";
    const status = /token|bearer|unauthorized/i.test(message) ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}

export async function PUT(request: Request) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-nutrition-meal-setup-put",
    scope: "write",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const authContext = await assertUserCanWrite(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "v1-nutrition-meal-setup-put",
      uid: authContext.uid,
      scope: "write",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const body = await parseJsonBody<SaveMealSetupBody>(request, bodySchema);
    if (!Array.isArray(body?.slots) || body.slots.length === 0) {
      return NextResponse.json({ message: "slots are required." }, { status: 400 });
    }

    const profile = await loadServerUserProfile(authContext.uid);
    const date = coerceDateKey(body.date);
    const plan = await loadActiveNutritionPlan(authContext.uid);
    const existingMealSetup = await loadMealSetup(authContext.uid, profile?.mealsPerDay ?? plan?.mealsPerDay ?? null);
    const activeLog = await loadDailyNutritionLog({
      uid: authContext.uid,
      date,
      mealSetup: existingMealSetup,
      plan,
    });

    const setup = await saveMealSetup(authContext.uid, body.slots, activeLog);
    return NextResponse.json(setup);
  } catch (error) {
    console.error("PUT /api/v1/nutrition/meal-setup failed", error);
    if (error instanceof InputValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to save meal setup.";
    const status = /suspended/i.test(message)
      ? 403
      : /token|bearer|unauthorized/i.test(message)
        ? 401
        : /missing|invalid|required|not found|unsupported/i.test(message)
          ? 400
          : 500;
    return NextResponse.json({ message }, { status });
  }
}
