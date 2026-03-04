import type { Metadata } from "next";
import NutritionClient from "./nutrition-client";
import { requireProtectedSession } from "@/lib/server-route-auth";

export const metadata: Metadata = {
  title: "Nutrition Plan",
  description: "View your calorie targets, macros, and current meal plan in Arc.",
};

export default async function NutritionPage() {
  await requireProtectedSession();
  return <NutritionClient />;
}
