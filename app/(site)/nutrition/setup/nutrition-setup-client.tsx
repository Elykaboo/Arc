"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { saveMemberProfile } from "@/lib/member-db";
import { regenerateNutritionPlan, saveMealSetup } from "@/lib/nutrition-client";
import { buildDefaultMealSlots } from "@/lib/nutrition-tracking";
import { loadUserProfile, saveUserProfile, type UserProfile } from "@/lib/profile-db";
import { savePublicUserProfile } from "@/lib/public-profile-db";

type SetupGoalOption = "fat_loss" | "maintenance" | "muscle_gain" | "lean_bulk" | "recomp";

const emptyProfile: UserProfile = {
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

const goalToNutritionGoal = (goal: SetupGoalOption): UserProfile["nutritionGoal"] => {
  if (goal === "fat_loss") return "lose";
  if (goal === "maintenance") return "maintain";
  if (goal === "muscle_gain") return "gain";
  if (goal === "lean_bulk") return "gain";
  return "maintain";
};

const nutritionGoalToGoal = (goal: UserProfile["nutritionGoal"]): SetupGoalOption => {
  if (goal === "lose") return "fat_loss";
  if (goal === "gain") return "muscle_gain";
  return "maintenance";
};

const parseNumber = (value: string, allowDecimal = false): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return allowDecimal ? Math.round(parsed * 10) / 10 : Math.round(parsed);
};

export default function NutritionSetupClient() {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [profile, setProfile] = useState<UserProfile>(emptyProfile);
  const [goal, setGoal] = useState<SetupGoalOption>("maintenance");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

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

        setUid(user.uid);
        try {
          const stored = await loadUserProfile(user.uid);
          const next = {
            ...emptyProfile,
            username: user.displayName?.trim() || user.email?.split("@")[0]?.trim() || "Athlete",
            ...stored,
          } satisfies UserProfile;
          setProfile(next);
          setGoal(nutritionGoalToGoal(next.nutritionGoal));
        } catch {
          setStatus({ type: "error", message: "Could not load nutrition settings." });
        } finally {
          setIsLoading(false);
        }
      })();
    });

    return unsubscribe;
  }, [router]);

  const isComplete = useMemo(() => {
    return Boolean(
      profile.age &&
        profile.heightCm &&
        profile.weightKg &&
        profile.activityLevel &&
        goalToNutritionGoal(goal),
    );
  }, [goal, profile.activityLevel, profile.age, profile.heightCm, profile.weightKg]);
  const setupDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const fieldClassName =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-slate-200 transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uid) return;

    setStatus(null);
    setIsSaving(true);

    try {
      const nextProfile: UserProfile = {
        ...profile,
        nutritionGoal: goalToNutritionGoal(goal),
        mealsPerDay: profile.mealsPerDay ?? 3,
      };

      await saveUserProfile(uid, nextProfile);
      await saveMemberProfile(uid, nextProfile);
      await savePublicUserProfile(uid, nextProfile);
      await saveMealSetup({
        date: new Date().toISOString().slice(0, 10),
        slots: buildDefaultMealSlots(nextProfile.mealsPerDay ?? 3),
      });
      await regenerateNutritionPlan();

      setStatus({ type: "success", message: "Nutrition setup, meal slots, and targets updated." });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to save nutrition setup.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white/90 text-slate-900 shadow-[0_24px_64px_rgba(15,23,42,0.14)]">
          <div className="bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_42%),radial-gradient(circle_at_top_left,rgba(249,115,22,0.14),transparent_34%),linear-gradient(180deg,#f8fbff_0%,#f6f8fc_100%)] p-5 sm:p-7">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-slate-300" />
                <div className="h-8 w-72 animate-pulse rounded bg-slate-300" />
                <div className="h-4 w-80 animate-pulse rounded bg-slate-200" />
              </div>
              <div className="h-8 w-28 animate-pulse rounded-full bg-slate-300" />
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
              <article className="rounded-2xl border border-slate-200 bg-white/85 p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
                  <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
                  <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
                  <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white/85 p-5">
                <div className="space-y-3">
                  <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
                  <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
                  <div className="h-10 animate-pulse rounded-lg bg-slate-200" />
                  <div className="h-14 animate-pulse rounded-xl bg-slate-200" />
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white/90 text-slate-900 shadow-[0_24px_64px_rgba(15,23,42,0.14)]">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_42%),radial-gradient(circle_at_top_left,rgba(249,115,22,0.14),transparent_34%),linear-gradient(180deg,#f8fbff_0%,#f6f8fc_100%)] p-5 sm:p-7">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Arc Nutrition</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Nutrition Setup</h1>
              <p className="mt-1 text-sm text-slate-600">Configure your body metrics and goals to power your daily dashboard targets.</p>
            </div>
            <div className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-800">
              {setupDate}
            </div>
          </header>

          <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <article className="rounded-2xl border border-slate-200 bg-white/85 p-5 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Body Metrics</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">Core Data</h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="nutrition-age" className="mb-1 block text-sm font-semibold text-slate-700">
                    Age
                  </label>
                  <input
                    id="nutrition-age"
                    type="number"
                    min={13}
                    max={100}
                    value={profile.age ?? ""}
                    onChange={(event) => setProfile((current) => ({ ...current, age: parseNumber(event.target.value) }))}
                    className={fieldClassName}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="nutrition-height" className="mb-1 block text-sm font-semibold text-slate-700">
                    Height (cm)
                  </label>
                  <input
                    id="nutrition-height"
                    type="number"
                    min={100}
                    max={250}
                    value={profile.heightCm ?? ""}
                    onChange={(event) => setProfile((current) => ({ ...current, heightCm: parseNumber(event.target.value) }))}
                    className={fieldClassName}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="nutrition-weight" className="mb-1 block text-sm font-semibold text-slate-700">
                    Weight (kg)
                  </label>
                  <input
                    id="nutrition-weight"
                    type="number"
                    step="0.1"
                    min={30}
                    max={300}
                    value={profile.weightKg ?? ""}
                    onChange={(event) => setProfile((current) => ({ ...current, weightKg: parseNumber(event.target.value, true) }))}
                    className={fieldClassName}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="nutrition-activity" className="mb-1 block text-sm font-semibold text-slate-700">
                    Activity Level
                  </label>
                  <select
                    id="nutrition-activity"
                    value={profile.activityLevel}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        activityLevel: event.target.value as UserProfile["activityLevel"],
                      }))
                    }
                    className={fieldClassName}
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
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white/85 p-5 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Target Setup</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">Goal and Schedule</h2>

              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="nutrition-goal" className="mb-1 block text-sm font-semibold text-slate-700">
                    Goal
                  </label>
                  <select
                    id="nutrition-goal"
                    value={goal}
                    onChange={(event) => setGoal(event.target.value as SetupGoalOption)}
                    className={fieldClassName}
                    required
                  >
                    <option value="fat_loss">Fat Loss</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="muscle_gain">Muscle Gain</option>
                    <option value="lean_bulk">Lean Bulk</option>
                    <option value="recomp">Body Recomposition</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Lean Bulk maps to Gain. Recomposition maps to Maintain.</p>
                </div>

                <div>
                  <label htmlFor="nutrition-meals" className="mb-1 block text-sm font-semibold text-slate-700">
                    Meals Per Day
                  </label>
                  <select
                    id="nutrition-meals"
                    value={profile.mealsPerDay ?? 3}
                    onChange={(event) => setProfile((current) => ({ ...current, mealsPerDay: parseNumber(event.target.value) ?? 3 }))}
                    className={fieldClassName}
                  >
                    <option value="2">2 meals</option>
                    <option value="3">3 meals</option>
                    <option value="4">4 meals</option>
                    <option value="5">5 meals</option>
                    <option value="6">6 meals</option>
                    <option value="7">7 meals</option>
                  </select>
                </div>

                <div
                  className={`rounded-xl p-3 ring-1 ${
                    isComplete ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200"
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-[0.14em] opacity-80">Profile Status</p>
                  <p className="mt-1 text-sm font-semibold">{isComplete ? "Profile complete" : "Profile incomplete"}</p>
                </div>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Nutrition Setup"}
                </button>
              </div>
            </article>

            {status ? (
              <p
                className={`rounded-xl px-3 py-2 text-sm ring-1 lg:col-span-2 ${
                  status.type === "success"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "border border-rose-200 bg-rose-50 text-rose-700 ring-rose-200"
                }`}
              >
                {status.message}
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}
