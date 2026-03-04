import type { Metadata } from "next";
import OnboardingClient from "./onboarding-client";
import { requireOnboardingSession } from "@/lib/server-route-auth";

export const metadata: Metadata = {
  title: "Nutrition Onboarding",
  description: "Set your body stats and goal so Arc can build your calorie, macro, and meal plan.",
};

export default async function OnboardingPage() {
  await requireOnboardingSession();
  return <OnboardingClient />;
}
