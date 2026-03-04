import type { Metadata } from "next";
import BmiClient from "./bmi-client";
import { requireProtectedSession } from "@/lib/server-route-auth";

export const metadata: Metadata = {
  title: "BMI Calculator | Arc Training Dashboard",
  description:
    "Use Arc's beginner-friendly BMI calculator to estimate body mass index and understand the result clearly.",
  alternates: {
    canonical: "/bmi",
  },
};

export default async function BmiPage() {
  await requireProtectedSession();
  return <BmiClient />;
}
