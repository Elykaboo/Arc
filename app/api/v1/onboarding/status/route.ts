import { NextResponse } from "next/server";
import { getMissingNutritionProfileFields, isNutritionProfileComplete } from "@/lib/nutrition-profile";
import { loadServerUserProfile } from "@/lib/server-profile-db";
import { getAuthenticatedUid } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const uid = await getAuthenticatedUid(request);
    const profile = await loadServerUserProfile(uid);
    const missingFields = getMissingNutritionProfileFields(profile ?? {});
    return NextResponse.json({
      onboardingComplete: profile ? isNutritionProfileComplete(profile) : false,
      missingFields,
    });
  } catch (error) {
    console.error("GET /api/v1/onboarding/status failed", error);
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = /token|bearer/i.test(message) ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
