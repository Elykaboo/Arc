import type { Metadata } from "next";
import NutritionClient from "./nutrition-client";

export const metadata: Metadata = {
  title: "Nutrition",
  description: "Track macros and meals with photo-based Gemini estimates.",
};

const isPreprodNutritionEnabled = () => {
  const value = process.env.NEXT_PUBLIC_ENABLE_PREPROD_NUTRITION?.trim().toLowerCase() ?? "";
  return value === "1" || value === "true" || value === "yes" || value === "on";
};

export default function NutritionPage() {
  if (isPreprodNutritionEnabled()) {
    return <NutritionClient />;
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Nutrition</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Nutrition pre-prod is disabled</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enable <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">NEXT_PUBLIC_ENABLE_PREPROD_NUTRITION</code>{" "}
          to turn on the new nutrition tracker.
        </p>
      </div>
    </section>
  );
}
