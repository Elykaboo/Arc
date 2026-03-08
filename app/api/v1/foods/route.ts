import { NextResponse } from "next/server";
import { searchCatalogFoods } from "@/lib/catalog-foods";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;
  const category = searchParams.get("category") || undefined;
  const mealTag = searchParams.get("mealTag") || undefined;
  const limitValue = searchParams.get("limit");
  const limit = limitValue ? Number.parseInt(limitValue, 10) : undefined;

  try {
    const items = searchCatalogFoods({ search, category, mealTag, limit });
    return NextResponse.json({
      total: items.length,
      items,
    });
  } catch {
    return NextResponse.json({ message: "Failed to load foods." }, { status: 502 });
  }
}
