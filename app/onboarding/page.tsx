import type { Metadata } from "next";
import OnboardingClient from "./onboarding-client";

export const metadata: Metadata = {
  title: "Nutrition Onboarding",
  description: "Set your body stats and goal so Arc can build your calorie, macro, and meal plan.",
};

export default function OnboardingPage() {
  return <OnboardingClient />;
}
