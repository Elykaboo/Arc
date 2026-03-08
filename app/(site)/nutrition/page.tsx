import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nutrition",
  description: "Nutrition is being redeveloped.",
};

export default function NutritionPage() {
  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Nutrition</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Under redevelopment</h1>
        <p className="mt-2 text-sm text-slate-600">
          This page is temporarily removed while a full nutrition rebuild is in progress.
        </p>
      </div>
    </section>
  );
}
