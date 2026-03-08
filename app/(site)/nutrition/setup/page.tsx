import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Nutrition Setup",
  description: "Nutrition setup is unavailable during redevelopment.",
};

export default function NutritionSetupPage() {
  redirect("/nutrition");
}
