import { NextResponse } from "next/server";
import { getAllBodyparts } from "@/lib/exercises";

export async function GET() {
  try {
    const bodyparts = await getAllBodyparts();
    return NextResponse.json(bodyparts);
  } catch {
    return NextResponse.json({ message: "Failed to load body parts from API" }, { status: 502 });
  }
}
