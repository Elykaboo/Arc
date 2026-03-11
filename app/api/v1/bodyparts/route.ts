import { NextResponse } from "next/server";
import { getAllBodyparts } from "@/lib/exercises";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";

export async function GET(request: Request) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-bodyparts",
    scope: "read",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const bodyparts = await getAllBodyparts();
    return NextResponse.json(bodyparts);
  } catch {
    return NextResponse.json({ message: "Failed to load body parts from API" }, { status: 502 });
  }
}
