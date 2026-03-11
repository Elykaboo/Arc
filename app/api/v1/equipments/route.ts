import { NextResponse } from "next/server";
import { getAllEquipments } from "@/lib/exercises";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";

export async function GET(request: Request) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-equipments",
    scope: "read",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const equipments = await getAllEquipments();
    return NextResponse.json(equipments);
  } catch {
    return NextResponse.json({ message: "Failed to load equipment list from API" }, { status: 502 });
  }
}
