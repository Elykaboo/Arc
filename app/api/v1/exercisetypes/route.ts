import { NextResponse } from "next/server";
import { getAllExerciseTypes } from "@/lib/exercises";

export async function GET() {
  const exerciseTypes = await getAllExerciseTypes();
  return NextResponse.json(exerciseTypes);
}
