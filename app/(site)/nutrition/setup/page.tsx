import type { Metadata } from "next";
import NutritionSetupClient from "./nutrition-setup-client";

export const metadata: Metadata = {
  title: "Nutrition Setup",
  description: "Configure body metrics, activity level, and nutrition goal.",
};

export default function NutritionSetupPage() {
  return <NutritionSetupClient />;
}
