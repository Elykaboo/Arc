import { NextResponse } from "next/server";
import { getAllMuscles } from "@/lib/exercises";

export async function GET() {
  try {
    const muscles = await getAllMuscles();
    return NextResponse.json(muscles);
  } catch {
    return NextResponse.json({ message: "Failed to load muscles from API" }, { status: 502 });
  }
}
