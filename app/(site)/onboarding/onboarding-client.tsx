"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { loadUserProfile, type UserProfile } from "@/lib/profile-db";
import { isNutritionProfileComplete } from "@/lib/nutrition-profile";

const defaultProfile: Pick<
  UserProfile,
  "sex" | "age" | "heightCm" | "weightKg" | "activityLevel" | "nutritionGoal" | "dailyCalorieOverride" | "mealsPerDay"
> = {
  sex: "",
  age: null,
  heightCm: null,
  weightKg: null,
  activityLevel: "",
  nutritionGoal: "",
  dailyCalorieOverride: null,
  mealsPerDay: 3,
};

const parseOptionalNumber = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
};

const fallbackProfileValues: Required<
  Pick<UserProfile, "sex" | "age" | "heightCm" | "weightKg" | "activityLevel" | "nutritionGoal" | "mealsPerDay">
> = {
  sex: "male",
  age: 25,
  heightCm: 170,
  weightKg: 70,
  activityLevel: "moderate",
  nutritionGoal: "maintain",
  mealsPerDay: 3,
};

export default function OnboardingClient() {
  const router = useRouter();
  const [profile, setProfile] = useState(defaultProfile);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
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
            dailyCalorieOverride: storedProfile.dailyCalorieOverride,
            mealsPerDay: storedProfile.mealsPerDay ?? 3,
          });

          if (isNutritionProfileComplete(storedProfile)) {
            router.replace("/socializing");
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
      const resolvedName =
        auth.currentUser?.displayName?.trim() ||
        auth.currentUser?.email?.split("@")[0]?.trim() ||
        "Athlete";
      router.replace(`/welcome?mode=new&name=${encodeURIComponent(resolvedName)}&next=${encodeURIComponent("/socializing")}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to continue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipForNow = async () => {
    setStatus(null);
    setIsSubmitting(true);

    const skipPayload = {
      ...profile,
      sex: profile.sex || fallbackProfileValues.sex,
      age: profile.age ?? fallbackProfileValues.age,
      heightCm: profile.heightCm ?? fallbackProfileValues.heightCm,
      weightKg: profile.weightKg ?? fallbackProfileValues.weightKg,
      activityLevel: profile.activityLevel || fallbackProfileValues.activityLevel,
      nutritionGoal: profile.nutritionGoal || fallbackProfileValues.nutritionGoal,
      mealsPerDay: profile.mealsPerDay ?? fallbackProfileValues.mealsPerDay,
    };

    try {
      void skipPayload;

      const resolvedName =
        auth.currentUser?.displayName?.trim() ||
        auth.currentUser?.email?.split("@")[0]?.trim() ||
        "Athlete";
      router.replace(`/welcome?mode=new&name=${encodeURIComponent(resolvedName)}&next=${encodeURIComponent("/socializing")}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to continue right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return null;
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
            <label htmlFor="onboarding-sex" className="mb-1 block text-sm font-semibold text-slate-700">
              Sex
            </label>
            <select
              id="onboarding-sex"
              value={profile.sex}
              onChange={(event) => setProfile((current) => ({ ...current, sex: event.target.value as UserProfile["sex"] }))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
              required
            >
              <option value="">Select sex</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="onboarding-age" className="mb-1 block text-sm font-semibold text-slate-700">
              Age
            </label>
            <input
              id="onboarding-age"
              type="number"
              min="13"
              max="100"
              value={profile.age ?? ""}
              onChange={(event) => setProfile((current) => ({ ...current, age: parseOptionalNumber(event.target.value) }))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
              required
            />
          </div>

          <div>
            <label htmlFor="onboarding-height" className="mb-1 block text-sm font-semibold text-slate-700">
              Height (cm)
            </label>
            <input
              id="onboarding-height"
              type="number"
              min="100"
              max="250"
              value={profile.heightCm ?? ""}
              onChange={(event) => setProfile((current) => ({ ...current, heightCm: parseOptionalNumber(event.target.value) }))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
              required
            />
          </div>

          <div>
            <label htmlFor="onboarding-weight" className="mb-1 block text-sm font-semibold text-slate-700">
              Weight (kg)
            </label>
            <input
              id="onboarding-weight"
              type="number"
              min="30"
              max="300"
              value={profile.weightKg ?? ""}
              onChange={(event) => setProfile((current) => ({ ...current, weightKg: parseOptionalNumber(event.target.value) }))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
              required
            />
          </div>

          <div>
            <label htmlFor="onboarding-activity" className="mb-1 block text-sm font-semibold text-slate-700">
              Activity level
            </label>
            <select
              id="onboarding-activity"
              value={profile.activityLevel}
              onChange={(event) =>
                setProfile((current) => ({ ...current, activityLevel: event.target.value as UserProfile["activityLevel"] }))
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
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
            <label htmlFor="onboarding-goal" className="mb-1 block text-sm font-semibold text-slate-700">
              Goal
            </label>
            <select
              id="onboarding-goal"
              value={profile.nutritionGoal}
              onChange={(event) =>
                setProfile((current) => ({ ...current, nutritionGoal: event.target.value as UserProfile["nutritionGoal"] }))
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
              required
            >
              <option value="">Select goal</option>
              <option value="lose">Lose</option>
              <option value="maintain">Maintain</option>
              <option value="gain">Gain</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="onboarding-meals" className="mb-1 block text-sm font-semibold text-slate-700">
              Preferred meal count
            </label>
            <select
              id="onboarding-meals"
              value={profile.mealsPerDay ?? 3}
              onChange={(event) =>
                setProfile((current) => ({ ...current, mealsPerDay: parseOptionalNumber(event.target.value) ?? 3 }))
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
              required
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
            <label htmlFor="onboarding-calorie-override" className="mb-1 block text-sm font-semibold text-slate-700">
              Manual calorie override
            </label>
            <input
              id="onboarding-calorie-override"
              type="number"
              min="1200"
              max="5000"
              value={profile.dailyCalorieOverride ?? ""}
              onChange={(event) =>
                setProfile((current) => ({ ...current, dailyCalorieOverride: parseOptionalNumber(event.target.value) }))
              }
              placeholder="Optional"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
            />
          </div>

          {status ? (
            <p className="sm:col-span-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {status}
            </p>
          ) : null}

          <div className="sm:col-span-2 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => void handleSkipForNow()}
              disabled={isSubmitting}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Skip for now
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Building plan..." : "Continue to nutrition"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
