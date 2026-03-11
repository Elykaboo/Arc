import { NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";

export async function GET(request: Request) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-liveness",
    scope: "read",
    ipPerMinute: 600,
  });
  if (rateLimitResponse) return rateLimitResponse;

  return NextResponse.json({
    status: "ok",
    service: "arc-api",
    timestamp: new Date().toISOString(),
  });
}
