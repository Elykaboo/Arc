import type { Metadata } from "next";
import HomeClient from "@/app/home-client";

export const metadata: Metadata = {
  title: "Workout Planner App for Weekly Gym Training",
  description:
    "Arc Workout Planner helps you build workouts, save reusable routines, and organize a clear weekly gym schedule.",
  keywords: [
    "workout planner app",
    "gym workout planner",
    "weekly training plan",
    "strength routine builder",
    "hypertrophy workout schedule",
    "fitness planning tool",
  ],
  alternates: {
    canonical: "/training-dashboard",
  },
  openGraph: {
    title: "Arc Workout Planner",
    description:
      "Build workouts, save routines, and map your weekly training plan with Arc.",
    url: "/training-dashboard",
    siteName: "Arc",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Arc Workout Planner",
    description:
      "Plan your gym week with structured workouts, routines, and scheduling tools.",
  },
};

export default function TrainingDashboardPage() {
  return <HomeClient />;
}
