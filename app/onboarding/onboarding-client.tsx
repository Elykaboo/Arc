"use client";

import { FormEvent, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/authenticated-fetch";
import { auth } from "@/lib/firebase";
import { loadUserProfile, type UserProfile } from "@/lib/profile-db";
import { isNutritionProfileComplete } from "@/lib/nutrition-profile";

const defaultProfile: Pick<
  UserProfile,
  "sex" | "age" | "heightCm" | "weightKg" | "activityLevel" | "nutritionGoal" | "mealsPerDay"
> = {
  sex: "",
  age: null,
  heightCm: null,
  weightKg: null,
  activityLevel: "",
  nutritionGoal: "",
  mealsPerDay: 3,
};

const parseInteger = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
};

export default function OnboardingClient() {
  const router = useRouter();
  const [profile, setProfile] = useState(defaultProfile);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      void (async () => {
        if (!user) {
          router.replace("/login");
          return;
        }

        if (!user.emailVerified) {
          router.replace("/verify-email");
          return;
        }

        const storedProfile = await loadUserProfile(user.uid);
        if (storedProfile) {
          setProfile({
            sex: storedProfile.sex,
            age: storedProfile.age,
            heightCm: storedProfile.heightCm,
            weightKg: storedProfile.weightKg,
            activityLevel: storedProfile.activityLevel,
            nutritionGoal: storedProfile.nutritionGoal,
            mealsPerDay: storedProfile.mealsPerDay ?? 3,
          });

          if (isNutritionProfileComplete(storedProfile)) {
            router.replace("/nutrition");
            return;
          }
        }

        setIsLoading(false);
      })();
    });

    return unsubscribe;
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/v1/nutrition/plan", {
        method: "POST",
        headers,
        body: JSON.stringify(profile),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorData?.message || "Unable to save your nutrition profile.");
      }

      router.replace("/nutrition");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save your nutrition profile.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return null;
  }

  return (
    <section className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-10">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Nutrition Setup
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Build your first meal plan
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Arc uses your body data and goal to calculate calories, split macros, and generate a meal plan you can edit later in Profile.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="onboarding-sex" className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Sex
            </label>
            <select
              id="onboarding-sex"
              value={profile.sex}
              onChange={(event) => setProfile((current) => ({ ...current, sex: event.target.value as UserProfile["sex"] }))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              required
            >
              <option value="">Select sex</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="onboarding-age" className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Age
            </label>
            <input
              id="onboarding-age"
              type="number"
              min="13"
              max="100"
              value={profile.age ?? ""}
              onChange={(event) => setProfile((current) => ({ ...current, age: parseInteger(event.target.value) }))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              required
            />
          </div>

          <div>
            <label htmlFor="onboarding-height" className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Height (cm)
            </label>
            <input
              id="onboarding-height"
              type="number"
              min="100"
              max="250"
              value={profile.heightCm ?? ""}
              onChange={(event) => setProfile((current) => ({ ...current, heightCm: parseInteger(event.target.value) }))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              required
            />
          </div>

          <div>
            <label htmlFor="onboarding-weight" className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Weight (kg)
            </label>
            <input
              id="onboarding-weight"
              type="number"
              min="30"
              max="300"
              value={profile.weightKg ?? ""}
              onChange={(event) => setProfile((current) => ({ ...current, weightKg: parseInteger(event.target.value) }))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              required
            />
          </div>

          <div>
            <label htmlFor="onboarding-activity" className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Activity level
            </label>
            <select
              id="onboarding-activity"
              value={profile.activityLevel}
              onChange={(event) =>
                setProfile((current) => ({ ...current, activityLevel: event.target.value as UserProfile["activityLevel"] }))
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              required
            >
              <option value="">Select activity</option>
              <option value="sedentary">Sedentary</option>
              <option value="light">Lightly active</option>
              <option value="moderate">Moderately active</option>
              <option value="active">Active</option>
              <option value="very_active">Very active</option>
            </select>
          </div>

          <div>
            <label htmlFor="onboarding-goal" className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Goal
            </label>
            <select
              id="onboarding-goal"
              value={profile.nutritionGoal}
              onChange={(event) =>
                setProfile((current) => ({ ...current, nutritionGoal: event.target.value as UserProfile["nutritionGoal"] }))
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              required
            >
              <option value="">Select goal</option>
              <option value="lose">Lose</option>
              <option value="maintain">Maintain</option>
              <option value="gain">Gain</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="onboarding-meals" className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Preferred meal count
            </label>
            <select
              id="onboarding-meals"
              value={profile.mealsPerDay ?? 3}
              onChange={(event) =>
                setProfile((current) => ({ ...current, mealsPerDay: parseInteger(event.target.value) ?? 3 }))
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              required
            >
              <option value="3">3 meals</option>
              <option value="4">4 meals</option>
              <option value="5">5 meals</option>
            </select>
          </div>

          {status ? (
            <p className="sm:col-span-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {status}
            </p>
          ) : null}

          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Building plan..." : "Continue to nutrition"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
