import type { Metadata } from "next";
import NutritionClient from "./nutrition-client";

export const metadata: Metadata = {
  title: "Nutrition Plan",
  description: "View your calorie targets, macros, and current meal plan in Arc.",
};

export default function NutritionPage() {
  return <NutritionClient />;
}
