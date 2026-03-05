import { NextResponse } from "next/server";
import { loadDailyNutritionLog, loadMealSetup, saveMealSetup } from "@/lib/nutrition-tracking-db";
import { coerceDateKey, normalizeMealSlots } from "@/lib/nutrition-tracking";
import { loadActiveNutritionPlan } from "@/lib/nutrition-db";
import { regenerateNutritionPlan } from "@/lib/nutrition-service";
import { loadServerUserProfile, saveServerUserProfile } from "@/lib/server-profile-db";
import { getAuthenticatedUid } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const uid = await getAuthenticatedUid(request);
    const profile = await loadServerUserProfile(uid);
    const mealSetup = await loadMealSetup(uid, profile?.mealsPerDay ?? null);
    return NextResponse.json({ mealSetup });
  } catch (error) {
    console.error("GET /api/v1/nutrition/meal-setup failed", error);
    const message = error instanceof Error ? error.message : "Unable to load meal setup.";
    const status = /token|bearer/i.test(message) ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    const uid = await getAuthenticatedUid(request);
    const profile = await loadServerUserProfile(uid);
    if (!profile) {
      return NextResponse.json({ message: "Profile not found." }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const date = coerceDateKey(searchParams.get("date"));
    const plan = await loadActiveNutritionPlan(uid);
    const existingMealSetup = await loadMealSetup(uid, profile?.mealsPerDay ?? plan?.mealsPerDay ?? null);
    const activeLog = await loadDailyNutritionLog({
      uid,
      date,
      mealSetup: existingMealSetup,
      plan,
    });
    const body = (await request.json()) as Record<string, unknown>;
    const rawSlots = Array.isArray(body.slots) ? body.slots : [];
    const slots = normalizeMealSlots(
      rawSlots.map((slot, index) => {
        const payload = slot as Record<string, unknown>;
        return {
          id: typeof payload.id === "string" ? payload.id : `slot-${index}`,
          label: typeof payload.label === "string" ? payload.label : `Meal ${index + 1}`,
          position: typeof payload.position === "number" ? payload.position : index,
        };
      }),
    );
    const mealSetup = await saveMealSetup(uid, slots, activeLog);

    // Keep profile setup and generated plan in sync with slot-count changes.
    const nextMealsPerDay = slots.length;
    if (profile.mealsPerDay !== nextMealsPerDay) {
      await saveServerUserProfile(uid, {
        ...profile,
        mealsPerDay: nextMealsPerDay,
      });
    }

    let regenerationWarning: string | null = null;
    try {
      await regenerateNutritionPlan(uid);
    } catch (error) {
      regenerationWarning =
        error instanceof Error ? error.message : "Meal setup saved, but plan regeneration is unavailable.";
    }

    return NextResponse.json({
      mealSetup,
      regeneratedPlan: !regenerationWarning,
      message: regenerationWarning ?? "Meal setup and plan updated.",
    });
  } catch (error) {
    console.error("PUT /api/v1/nutrition/meal-setup failed", error);
    const message = error instanceof Error ? error.message : "Unable to save meal setup.";
    const status = /token|bearer/i.test(message) ? 401 : /slot|Meal setup|Reassign/i.test(message) ? 400 : 500;
    return NextResponse.json({ message }, { status });
  }
}
