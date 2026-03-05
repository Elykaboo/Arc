"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/authenticated-fetch";
import { auth } from "@/lib/firebase";
import { saveMemberProfile } from "@/lib/member-db";
import { isNutritionProfileComplete } from "@/lib/nutrition-profile";
import { loadUserProfile, saveUserProfile, type UserProfile } from "@/lib/profile-db";
import { savePublicUserProfile } from "@/lib/public-profile-db";

const defaultProfile: UserProfile = {
  username: "",
  sex: "",
  age: null,
  heightCm: null,
  weightKg: null,
  activityLevel: "",
  nutritionGoal: "",
  dailyCalorieOverride: null,
  mealsPerDay: 3,
  bio: "",
  workoutSplit: "",
  photoDataUrl: "",
};

const parseOptionalNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
};

export default function NutritionSetupClient() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const setupComplete = useMemo(
    () =>
      isNutritionProfileComplete({
        sex: profile.sex,
        age: profile.age,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        activityLevel: profile.activityLevel,
        nutritionGoal: profile.nutritionGoal,
        mealsPerDay: profile.mealsPerDay,
      }),
    [profile],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUserId(user?.uid ?? null);
      setIsAuthResolved(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAuthResolved) return;
    if (!userId) {
      setIsLoading(false);
      router.replace("/login");
      return;
    }

    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      try {
        const stored = await loadUserProfile(userId);
        if (cancelled) return;
        setProfile((current) => ({ ...current, ...(stored ?? {}) }));
      } catch {
        if (!cancelled) {
          setStatus({ type: "error", message: "Unable to load your nutrition setup." });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthResolved, router, userId]);

  const updateField = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    setProfile((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) return;
    setStatus(null);
    setIsSaving(true);

    try {
      await saveUserProfile(userId, profile);
      await Promise.allSettled([
        saveMemberProfile(userId, profile),
        savePublicUserProfile(userId, profile),
      ]);

      const headers = await getAuthHeaders();
      const response = await fetch("/api/v1/nutrition/plan", {
        method: "POST",
        headers,
        body: JSON.stringify({
          sex: profile.sex,
          age: profile.age,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          activityLevel: profile.activityLevel,
          nutritionGoal: profile.nutritionGoal,
          dailyCalorieOverride: profile.dailyCalorieOverride,
          mealsPerDay: profile.mealsPerDay,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorData?.message || "Unable to regenerate nutrition plan.");
      }

      setStatus({
        type: "success",
        message: "Nutrition setup saved. Meal recommendations were regenerated.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to save nutrition setup.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAuthResolved || isLoading) {
    return (
      <section className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Loading nutrition setup...
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Nutrition</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Nutrition Setup</h1>
        <p className="mt-2 text-sm text-slate-600">
          Update the inputs that drive your calorie target and meal recommendations.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</p>
            <p className="mt-1 text-sm text-slate-600">
              {setupComplete ? "Setup is complete and ready for plan generation." : "Complete all required fields."}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              setupComplete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {setupComplete ? "Complete" : "Needs attention"}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="setup-sex" className="mb-1 block text-sm font-semibold text-slate-700">
              Sex
            </label>
            <select
              id="setup-sex"
              value={profile.sex}
              onChange={(event) => updateField("sex", event.target.value as UserProfile["sex"])}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
            >
              <option value="">Select sex</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="setup-age" className="mb-1 block text-sm font-semibold text-slate-700">
              Age
            </label>
            <input
              id="setup-age"
              type="number"
              min="13"
              max="100"
              value={profile.age ?? ""}
              onChange={(event) => updateField("age", parseOptionalNumber(event.target.value))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
            />
          </div>

          <div>
            <label htmlFor="setup-height" className="mb-1 block text-sm font-semibold text-slate-700">
              Height (cm)
            </label>
            <input
              id="setup-height"
              type="number"
              min="100"
              max="250"
              value={profile.heightCm ?? ""}
              onChange={(event) => updateField("heightCm", parseOptionalNumber(event.target.value))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
            />
          </div>

          <div>
            <label htmlFor="setup-weight" className="mb-1 block text-sm font-semibold text-slate-700">
              Weight (kg)
            </label>
            <input
              id="setup-weight"
              type="number"
              min="30"
              max="300"
              value={profile.weightKg ?? ""}
              onChange={(event) => updateField("weightKg", parseOptionalNumber(event.target.value))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
            />
          </div>

          <div>
            <label htmlFor="setup-activity" className="mb-1 block text-sm font-semibold text-slate-700">
              Activity level
            </label>
            <select
              id="setup-activity"
              value={profile.activityLevel}
              onChange={(event) => updateField("activityLevel", event.target.value as UserProfile["activityLevel"])}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
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
            <label htmlFor="setup-goal" className="mb-1 block text-sm font-semibold text-slate-700">
              Goal
            </label>
            <select
              id="setup-goal"
              value={profile.nutritionGoal}
              onChange={(event) => updateField("nutritionGoal", event.target.value as UserProfile["nutritionGoal"])}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
            >
              <option value="">Select goal</option>
              <option value="lose">Lose</option>
              <option value="maintain">Maintain</option>
              <option value="gain">Gain</option>
            </select>
          </div>

          <div>
            <label htmlFor="setup-meals" className="mb-1 block text-sm font-semibold text-slate-700">
              Preferred meal count
            </label>
            <select
              id="setup-meals"
              value={profile.mealsPerDay ?? 3}
              onChange={(event) => updateField("mealsPerDay", parseOptionalNumber(event.target.value))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
            >
              <option value="2">2 meals</option>
              <option value="3">3 meals</option>
              <option value="4">4 meals</option>
              <option value="5">5 meals</option>
              <option value="6">6 meals</option>
              <option value="7">7 meals</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="setup-calorie-override" className="mb-1 block text-sm font-semibold text-slate-700">
              Manual calorie override
            </label>
            <input
              id="setup-calorie-override"
              type="number"
              min="1200"
              max="5000"
              value={profile.dailyCalorieOverride ?? ""}
              onChange={(event) => updateField("dailyCalorieOverride", parseOptionalNumber(event.target.value))}
              placeholder="Optional"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
            />
          </div>
        </div>

        {status ? (
          <p
            className={`mt-4 rounded-md px-3 py-2 text-sm ${
              status.type === "error"
                ? "border border-rose-200 bg-rose-50 text-rose-700"
                : "border border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {status.message}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/nutrition"
            className="rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Back to nutrition
          </Link>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? "Saving..." : "Save setup"}
          </button>
        </div>
      </form>
    </section>
  );
}
