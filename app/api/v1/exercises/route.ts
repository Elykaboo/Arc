import { NextResponse } from "next/server";
import { filterExercises } from "@/lib/exercises";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const search = searchParams.get("search") || undefined;
  const bodypart = searchParams.get("bodypart") || undefined;
  const muscle = searchParams.get("muscle") || undefined;
  const equipment = searchParams.get("equipment") || undefined;
  const limitValue = searchParams.get("limit");
  const limit = limitValue ? Number.parseInt(limitValue, 10) : undefined;

  try {
    const items = await filterExercises({
      search,
      bodypart,
      muscle,
      equipment,
      limit,
    });

    return NextResponse.json({
      total: items.length,
      items,
    });
  } catch {
    return NextResponse.json({ message: "Failed to load exercises from API" }, { status: 502 });
  }
}
