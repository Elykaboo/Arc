import { NextResponse } from "next/server";
import { getAllMuscles } from "@/lib/exercises";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";

export async function GET(request: Request) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-muscles",
    scope: "read",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const muscles = await getAllMuscles();
    return NextResponse.json(muscles);
  } catch {
    return NextResponse.json({ message: "Failed to load muscles from API" }, { status: 502 });
  }
}
