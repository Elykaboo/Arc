import type { Metadata } from "next";
import NutritionSetupClient from "./setup-client";

export const metadata: Metadata = {
  title: "Nutrition Setup",
  description: "Update your nutrition setup to regenerate targets and meal recommendations.",
};

export default function NutritionSetupPage() {
  return <NutritionSetupClient />;
}
