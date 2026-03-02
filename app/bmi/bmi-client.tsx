"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type UnitSystem = "metric" | "imperial";

const bmiCategories = [
  {
    name: "Underweight",
    range: "Below 18.5",
    color: "text-sky-700",
    accent: "bg-sky-500",
    description: "A gentle reminder to focus on fueling well and building steady habits.",
  },
  {
    name: "Healthy",
    range: "18.5 - 24.9",
    color: "text-emerald-700",
    accent: "bg-emerald-500",
    description: "A solid baseline. Keep your training, sleep, and nutrition consistent.",
  },
  {
    name: "Overweight",
    range: "25 - 29.9",
    color: "text-amber-700",
    accent: "bg-amber-500",
    description: "Progress still comes from steady workouts, food quality, and patience.",
  },
  {
    name: "Obesity",
    range: "30 and above",
    color: "text-rose-700",
    accent: "bg-rose-500",
    description: "Use the dashboard as a starting point and adjust one habit at a time.",
  },
] as const;

const beginnerTips = [
  "Use BMI as a rough screening tool, not a full health diagnosis.",
  "Track your workouts, sleep, and food habits together for a clearer picture.",
  "If you lift weights, your BMI can read higher without meaning poor progress.",
];

const getCategory = (bmi: number) => {
  if (bmi < 18.5) return bmiCategories[0];
  if (bmi < 25) return bmiCategories[1];
  if (bmi < 30) return bmiCategories[2];
  return bmiCategories[3];
};

export default function BmiClient() {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("metric");
  const [heightCm, setHeightCm] = useState("170");
  const [weightKg, setWeightKg] = useState("70");
  const [heightFeet, setHeightFeet] = useState("5");
  const [heightInches, setHeightInches] = useState("7");
  const [weightLbs, setWeightLbs] = useState("154");

  const bmi = useMemo(() => {
    if (unitSystem === "metric") {
      const height = Number(heightCm);
      const weight = Number(weightKg);
      if (!height || !weight || height <= 0 || weight <= 0) return null;
      const meters = height / 100;
      return weight / (meters * meters);
    }

    const feet = Number(heightFeet);
    const inches = Number(heightInches);
    const pounds = Number(weightLbs);
    const totalInches = feet * 12 + inches;

    if (!totalInches || !pounds || totalInches <= 0 || pounds <= 0) return null;
    return (703 * pounds) / (totalInches * totalInches);
  }, [heightCm, heightFeet, heightInches, unitSystem, weightKg, weightLbs]);

  const roundedBmi = bmi ? bmi.toFixed(1) : "--";
  const category = bmi ? getCategory(bmi) : null;
  const gaugeWidth = bmi ? Math.min(100, Math.max(8, Math.round((bmi / 40) * 100))) : 8;

  return (
    <main className="dashboard-shell relative overflow-hidden px-4 py-8 sm:px-8 sm:py-12">
      <div className="dashboard-grid pointer-events-none absolute inset-0 opacity-50" />
      <div className="dashboard-glow dashboard-glow--amber pointer-events-none absolute -left-16 top-0 h-56 w-56" />
      <div className="dashboard-glow dashboard-glow--blue pointer-events-none absolute right-0 top-28 h-72 w-72" />

      <section className="dashboard-panel relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-orange-100/80 bg-[linear-gradient(145deg,rgba(255,247,237,0.96),rgba(255,255,255,0.92))] p-6 shadow-[0_28px_90px_-45px_rgba(249,115,22,0.45)] dark:border-orange-300/10 dark:bg-[linear-gradient(145deg,rgba(39,18,9,0.92),rgba(15,23,42,0.95))] sm:p-8">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#fb923c,#f97316,#fdba74)]" />
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div className="dashboard-float inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-orange-100/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-orange-700 dark:border-orange-300/20 dark:bg-orange-500/10 dark:text-orange-200">
              Training Dashboard
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-300">
                BMI Page
              </p>
              <h1 className="mt-3 max-w-2xl text-4xl font-black tracking-tight text-slate-900 dark:text-slate-50 sm:text-5xl">
                A softer, clearer BMI calculator for beginners
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
                Check your body mass index, understand the number, and keep it in context with your training habits.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[0_14px_35px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Best for
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Quick self-checks</p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[0_14px_35px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Keep in mind
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Muscle mass can skew it</p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[0_14px_35px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Next step
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Pair it with your weekly plan</p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-orange-200/80 bg-white/80 p-5 shadow-[0_18px_40px_rgba(249,115,22,0.12)] backdrop-blur dark:border-orange-300/15 dark:bg-white/5 sm:p-6">
            <div className="inline-flex rounded-full border border-orange-200 bg-orange-50 p-1 dark:border-orange-300/20 dark:bg-orange-500/10">
              <button
                type="button"
                onClick={() => setUnitSystem("metric")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  unitSystem === "metric"
                    ? "bg-orange-500 text-white shadow-[0_10px_24px_rgba(249,115,22,0.28)]"
                    : "text-orange-700 dark:text-orange-100"
                }`}
              >
                Metric
              </button>
              <button
                type="button"
                onClick={() => setUnitSystem("imperial")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  unitSystem === "imperial"
                    ? "bg-orange-500 text-white shadow-[0_10px_24px_rgba(249,115,22,0.28)]"
                    : "text-orange-700 dark:text-orange-100"
                }`}
              >
                Imperial
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              {unitSystem === "metric" ? (
                <>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Height (cm)</span>
                    <input
                      type="number"
                      min="1"
                      value={heightCm}
                      onChange={(event) => setHeightCm(event.target.value)}
                      className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 dark:border-orange-300/20 dark:bg-slate-950/50 dark:text-slate-100 dark:focus:ring-orange-500/20"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Weight (kg)</span>
                    <input
                      type="number"
                      min="1"
                      value={weightKg}
                      onChange={(event) => setWeightKg(event.target.value)}
                      className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 dark:border-orange-300/20 dark:bg-slate-950/50 dark:text-slate-100 dark:focus:ring-orange-500/20"
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Height (ft)</span>
                      <input
                        type="number"
                        min="0"
                        value={heightFeet}
                        onChange={(event) => setHeightFeet(event.target.value)}
                        className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 dark:border-orange-300/20 dark:bg-slate-950/50 dark:text-slate-100 dark:focus:ring-orange-500/20"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Height (in)</span>
                      <input
                        type="number"
                        min="0"
                        value={heightInches}
                        onChange={(event) => setHeightInches(event.target.value)}
                        className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 dark:border-orange-300/20 dark:bg-slate-950/50 dark:text-slate-100 dark:focus:ring-orange-500/20"
                      />
                    </label>
                  </div>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Weight (lb)</span>
                    <input
                      type="number"
                      min="1"
                      value={weightLbs}
                      onChange={(event) => setWeightLbs(event.target.value)}
                      className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 dark:border-orange-300/20 dark:bg-slate-950/50 dark:text-slate-100 dark:focus:ring-orange-500/20"
                    />
                  </label>
                </>
              )}
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-slate-200/80 bg-slate-950 p-5 text-white shadow-[0_20px_36px_rgba(15,23,42,0.22)]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200">Live BMI result</p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <div>
                  <p className="text-4xl font-black">{roundedBmi}</p>
                  <p className="mt-2 text-sm text-slate-300">
                    {category ? `${category.name} range` : "Add valid values to calculate"}
                  </p>
                </div>
                <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-orange-100">
                  {unitSystem === "metric" ? "kg / cm" : "lb / ft-in"}
                </div>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${category?.accent ?? "bg-orange-500"}`}
                  style={{ width: `${gaugeWidth}%` }}
                />
              </div>
              {category ? (
                <p className="mt-4 text-sm leading-6 text-slate-300">{category.description}</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-6 grid max-w-6xl gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="dashboard-panel rounded-[1.75rem] border border-slate-200/80 bg-white/85 p-5 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.32)] backdrop-blur dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">BMI ranges</h2>
            <Link
              href="/"
              className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 dark:border-orange-300/20 dark:bg-orange-500/10 dark:text-orange-100"
            >
              Back to dashboard
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {bmiCategories.map((item) => {
              const isCurrent = item.name === category?.name;
              return (
                <div
                  key={item.name}
                  className={`rounded-2xl border px-4 py-4 transition ${
                    isCurrent
                      ? "border-orange-300 bg-orange-50 shadow-[0_14px_28px_rgba(249,115,22,0.14)] dark:border-orange-300/30 dark:bg-orange-500/10"
                      : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-900/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className={`text-sm font-bold ${item.color} dark:text-slate-100`}>{item.name}</p>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{item.range}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.description}</p>
                </div>
              );
            })}
          </div>
        </article>

        <article className="dashboard-panel rounded-[1.75rem] border border-slate-200/80 bg-white/85 p-5 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.32)] backdrop-blur dark:border-white/10 dark:bg-white/5">
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">Beginner notes</h2>
          <div className="mt-4 grid gap-3">
            {beginnerTips.map((tip, index) => (
              <div
                key={tip}
                className="rounded-2xl border border-slate-200 bg-[linear-gradient(145deg,rgba(255,247,237,0.72),rgba(248,250,252,0.92))] p-4 transition hover:-translate-y-0.5 hover:shadow-[0_18px_32px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(124,45,18,0.16),rgba(15,23,42,0.75))]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700 dark:text-orange-300">
                  Tip {index + 1}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{tip}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-slate-900/60">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Good follow-up
            </p>
            <h3 className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100">
              Pair this with your weekly training plan
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              BMI makes more sense when you review it alongside your consistency, exercise schedule, and recovery habits.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/planner"
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                Open planner
              </Link>
              <Link
                href="/workouts"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
              >
                Browse workouts
              </Link>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
