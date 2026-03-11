import { NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { loadServerUserProfile } from "@/lib/server-profile-db";
import { getAuthenticatedUid } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-onboarding-status",
    scope: "read",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const uid = await getAuthenticatedUid(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "v1-onboarding-status",
      uid,
      scope: "read",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    await loadServerUserProfile(uid);
    return NextResponse.json({
      onboardingComplete: true,
      missingFields: [],
    });
  } catch (error) {
    console.error("GET /api/v1/onboarding/status failed", error);
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = /token|bearer/i.test(message) ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
