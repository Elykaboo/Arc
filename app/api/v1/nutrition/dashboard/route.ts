import { NextResponse } from "next/server";
import { buildNutritionDashboard } from "@/lib/nutrition-tracking-db";
import { coerceDateKey } from "@/lib/nutrition-tracking";
import { loadServerUserProfile } from "@/lib/server-profile-db";
import { getAuthenticatedUid } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const uid = await getAuthenticatedUid(request);
    const profile = await loadServerUserProfile(uid);
    const { searchParams } = new URL(request.url);
    const date = coerceDateKey(searchParams.get("date"));
    const dashboard = await buildNutritionDashboard({
      uid,
      date,
      mealsPerDay: profile?.mealsPerDay ?? null,
    });
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("GET /api/v1/nutrition/dashboard failed", error);
    const message = error instanceof Error ? error.message : "Unable to load dashboard.";
    const status = /token|bearer/i.test(message) ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
