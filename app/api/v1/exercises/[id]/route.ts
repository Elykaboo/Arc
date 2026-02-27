import { NextResponse } from "next/server";
import { findExerciseById } from "@/lib/exercises";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  let exercise = null;

  try {
    exercise = await findExerciseById(params.id);
  } catch {
    return NextResponse.json({ message: "Failed to load exercises from API" }, { status: 502 });
  }

  if (!exercise) {
    return NextResponse.json({ message: "Exercise not found" }, { status: 404 });
  }

  return NextResponse.json(exercise);
}
