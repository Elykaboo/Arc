import { NextResponse } from "next/server";
import { getAllExerciseTypes } from "@/lib/exercises";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";

export async function GET(request: Request) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-exercisetypes",
    scope: "read",
  });
  if (rateLimitResponse) return rateLimitResponse;

  const exerciseTypes = await getAllExerciseTypes();
  return NextResponse.json(exerciseTypes);
}
