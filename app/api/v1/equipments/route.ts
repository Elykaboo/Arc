import { NextResponse } from "next/server";
import { getAllEquipments } from "@/lib/exercises";

export async function GET() {
  try {
    const equipments = await getAllEquipments();
    return NextResponse.json(equipments);
  } catch {
    return NextResponse.json({ message: "Failed to load equipment list from API" }, { status: 502 });
  }
}
