import { NextResponse } from "next/server";
import { findExerciseById } from "@/lib/exercises";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseRouteParams, v } from "@/lib/request-validation";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const paramsSchema = v.object({
  id: v.string({ trim: true, minLength: 1, maxLength: 80 }),
});

export async function GET(request: Request, context: RouteContext) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-exercises-by-id",
    scope: "read",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const params = parseRouteParams<{ id: string }>(await context.params, paramsSchema);
    const exercise = await findExerciseById(params.id);

    if (!exercise) {
      return NextResponse.json({ message: "Exercise not found" }, { status: 404 });
    }

    return NextResponse.json(exercise);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: "Failed to load exercises from API" }, { status: 502 });
  }
}
