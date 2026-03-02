import type { Metadata } from "next";
import BmiClient from "./bmi-client";

export const metadata: Metadata = {
  title: "BMI Calculator | Arc Training Dashboard",
  description:
    "Use Arc's beginner-friendly BMI calculator to estimate body mass index and understand the result clearly.",
  alternates: {
    canonical: "/bmi",
  },
};

export default function BmiPage() {
  return <BmiClient />;
}
