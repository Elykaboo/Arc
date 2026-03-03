"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/authenticated-fetch";
import { auth } from "@/lib/firebase";
import type { ActiveNutritionPlan } from "@/types/nutrition";

export default function NutritionClient() {
  const router = useRouter();
  const [plan, setPlan] = useState<ActiveNutritionPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      void (async () => {
        if (!user) {
          setIsLoading(false);
          router.replace("/login");
          return;
        }

        try {
          const headers = await getAuthHeaders();
          const response = await fetch("/api/v1/nutrition/plan", {
            headers,
            cache: "no-store",
          });

          if (response.status === 404) {
            setIsLoading(false);
            router.replace("/onboarding");
            return;
          }

          if (response.status === 401) {
            setIsLoading(false);
            router.replace("/login");
            return;
          }

          if (!response.ok) {
            const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
            throw new Error(errorData?.message || "Unable to load your nutrition plan.");
          }

          const data = (await response.json()) as { plan: ActiveNutritionPlan };
          setPlan(data.plan);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Unable to load your nutrition plan.");
        } finally {
          setIsLoading(false);
        }
      })();
    });

    return unsubscribe;
  }, [router]);

  const handleRegenerate = async () => {
    setStatus(null);
    setIsRegenerating(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/v1/nutrition/plan/regenerate", {
        method: "POST",
        headers,
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorData?.message || "Unable to regenerate your meal plan.");
      }

      const data = (await response.json()) as { plan: ActiveNutritionPlan };
      setPlan(data.plan);
      setStatus("Meal plan refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to regenerate your meal plan.");
    } finally {
      setIsRegenerating(false);
    }
  };

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Loading nutrition plan...
        </div>
      </section>
    );
  }

  if (!plan) {
    return (
      <section className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Nutrition
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Nutrition plan unavailable
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {status || "Arc could not load your nutrition plan right now."}
          </p>
          <div className="mt-5 flex gap-3">
            <Link
              href="/onboarding"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Go to onboarding
            </Link>
            <Link
              href="/profile"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Edit profile
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Nutrition</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Your active meal plan</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            USDA-backed targets with AI-assisted meal suggestions when available.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/profile"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Edit inputs
          </Link>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isRegenerating ? "Refreshing..." : "Regenerate meal plan"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Calories</p>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{plan.targets.calories}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Protein</p>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{plan.targets.proteinGrams}g</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Carbs</p>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{plan.targets.carbsGrams}g</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Fat</p>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{plan.targets.fatGrams}g</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {plan.meals.map((meal) => (
          <article
            key={meal.slot}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  {meal.slot}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{meal.label}</h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">{meal.totals.calories} kcal</p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
                P {meal.totals.proteinGrams}g
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
                C {meal.totals.carbsGrams}g
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
                F {meal.totals.fatGrams}g
              </span>
            </div>

            <ul className="mt-4 space-y-3">
              {meal.foods.map((food) => (
                <li key={`${meal.slot}:${food.foodId}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{food.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {food.quantity} x {food.servingLabel} • {food.source.toUpperCase()}
                      </p>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{food.calories} kcal</p>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      {plan.warnings.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-200">
          {plan.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      {status ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {status}
        </p>
      ) : null}
    </section>
  );
}
