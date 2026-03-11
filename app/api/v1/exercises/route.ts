import { NextResponse } from "next/server";
import { filterExercises } from "@/lib/exercises";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseQueryParams, v } from "@/lib/request-validation";

const exercisesQuerySchema = v.object({
  search: v.string({ trim: true, maxLength: 120, optional: true }),
  bodypart: v.string({ trim: true, maxLength: 60, optional: true }),
  muscle: v.string({ trim: true, maxLength: 60, optional: true }),
  equipment: v.string({ trim: true, maxLength: 60, optional: true }),
  limit: v.number({ integer: true, min: 1, max: 200, coerce: true, optional: true }),
});

export async function GET(request: Request) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-exercises",
    scope: "read",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const query = parseQueryParams<{
      search?: string;
      bodypart?: string;
      muscle?: string;
      equipment?: string;
      limit?: number;
    }>(request, exercisesQuerySchema);

    const items = await filterExercises({
      search: query.search,
      bodypart: query.bodypart,
      muscle: query.muscle,
      equipment: query.equipment,
      limit: query.limit,
    });

    return NextResponse.json({
      total: items.length,
      items,
    });
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: "Failed to load exercises from API" }, { status: 502 });
  }
}
