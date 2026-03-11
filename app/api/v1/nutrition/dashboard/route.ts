import { NextResponse } from "next/server";
import { buildNutritionDashboard } from "@/lib/nutrition-tracking-db";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseQueryParams, v } from "@/lib/request-validation";
import { coerceDateKey } from "@/lib/nutrition-tracking";
import { loadServerUserProfile } from "@/lib/server-profile-db";
import { getAuthenticatedUid } from "@/lib/server-auth";

export const runtime = "nodejs";

const querySchema = v.object({
  date: v.string({ trim: true, pattern: /^\d{4}-\d{2}-\d{2}$/, optional: true }),
});

export async function GET(request: Request) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-nutrition-dashboard",
    scope: "read",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const uid = await getAuthenticatedUid(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "v1-nutrition-dashboard",
      uid,
      scope: "read",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const query = parseQueryParams<{ date?: string }>(request, querySchema);
    const date = coerceDateKey(query.date ?? null);
    const profile = await loadServerUserProfile(uid);
    const dashboard = await buildNutritionDashboard({
      uid,
      date,
      mealsPerDay: profile?.mealsPerDay ?? null,
    });
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("GET /api/v1/nutrition/dashboard failed", error);
    if (error instanceof InputValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to load nutrition dashboard.";
    const status = /token|bearer|unauthorized/i.test(message) ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
