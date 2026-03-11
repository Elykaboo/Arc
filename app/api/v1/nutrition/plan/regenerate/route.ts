import { NextResponse } from "next/server";
import { regenerateNutritionPlan } from "@/lib/nutrition-service";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { assertUserCanWrite } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-nutrition-plan-regenerate",
    scope: "expensive",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const authContext = await assertUserCanWrite(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "v1-nutrition-plan-regenerate",
      uid: authContext.uid,
      scope: "expensive",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const plan = await regenerateNutritionPlan(authContext.uid);
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("POST /api/v1/nutrition/plan/regenerate failed", error);
    const message = error instanceof Error ? error.message : "Unable to regenerate nutrition plan.";
    const status = /suspended/i.test(message)
      ? 403
      : /token|bearer|unauthorized/i.test(message)
        ? 401
        : /invalid|profile is incomplete|not found/i.test(message)
          ? 400
          : 500;
    return NextResponse.json({ message }, { status });
  }
}
