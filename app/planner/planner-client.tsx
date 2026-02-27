"use client";

import { useEffect, useMemo, useState } from "react";
import type { Exercise } from "@/types/workout";

type ExerciseResponse = {
  total: number;
  items: Exercise[];
};

type WorkoutItem = {
  id: string;
  exerciseId: string;
  sets: number;
  reps: string;
};

type DayPlan = {
  items: WorkoutItem[];
};

type WeeklyDraft = Record<string, DayPlan>;

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const dayFocus = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Cardio"];
const plannerStorageKey = "weeklyPlanDraft";

const createItem = (exerciseId = ""): WorkoutItem => ({
  id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  exerciseId,
  sets: 3,
  reps: "8-12",
});

const emptyDraft: WeeklyDraft = Object.fromEntries(weekdays.map((day) => [day, { items: [] }]));

const parsePositiveInt = (value: unknown, fallback = 3): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
};

const normalizeItem = (item: unknown): WorkoutItem | null => {
  if (!item || typeof item !== "object") return null;

  const data = item as Partial<WorkoutItem>;
  return {
    id: typeof data.id === "string" && data.id.trim() ? data.id : createItem().id,
    exerciseId: typeof data.exerciseId === "string" ? data.exerciseId : "",
    sets: parsePositiveInt(data.sets, 3),
    reps: typeof data.reps === "string" && data.reps.trim() ? data.reps : "8-12",
  };
};

const normalizeDraft = (draft: unknown): WeeklyDraft => {
  if (!draft || typeof draft !== "object") return emptyDraft;

  return Object.fromEntries(
    weekdays.map((day) => {
      const raw = (draft as Record<string, unknown>)[day];
      if (!raw || typeof raw !== "object") return [day, { items: [] }];

      const dayPlan = raw as Record<string, unknown>;

      if (Array.isArray(dayPlan.items)) {
        return [day, { items: dayPlan.items.map(normalizeItem).filter(Boolean) as WorkoutItem[] }];
      }

      const legacyItem = normalizeItem(dayPlan);
      if (!legacyItem || !legacyItem.exerciseId) return [day, { items: [] }];
      return [day, { items: [legacyItem] }];
    }),
  ) as WeeklyDraft;
};

export default function PlannerClient() {
  const [exerciseOptions, setExerciseOptions] = useState<Exercise[]>([]);
  const [plan, setPlan] = useState<WeeklyDraft>(emptyDraft);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(plannerStorageKey);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      const normalized = normalizeDraft(parsed);
      const snapshot = JSON.stringify(normalized);
      setPlan(normalized);
      setLastSavedSnapshot(snapshot);
    } catch {
      setPlan(emptyDraft);
    }
  }, []);

  useEffect(() => {
    const loadExercises = async () => {
      try {
        const response = await fetch("/api/v1/exercises", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load exercises");
        const payload = (await response.json()) as ExerciseResponse;
        setExerciseOptions(payload.items);
      } finally {
        setIsLoading(false);
      }
    };

    loadExercises();
  }, []);

  const exerciseById = useMemo(
    () => new Map(exerciseOptions.map((exercise) => [exercise.id, exercise])),
    [exerciseOptions],
  );

  const summary = useMemo(
    () =>
      weekdays.filter((day) => plan[day].items.some((item) => item.exerciseId.trim())).length,
    [plan],
  );

  const totalWorkouts = useMemo(
    () =>
      weekdays.reduce(
        (count, day) => count + plan[day].items.filter((item) => item.exerciseId.trim()).length,
        0,
      ),
    [plan],
  );

  const totalSets = useMemo(
    () =>
      weekdays.reduce(
        (sum, day) =>
          sum +
          plan[day].items.reduce(
            (daySum, item) => (item.exerciseId.trim() ? daySum + item.sets : daySum),
            0,
          ),
        0,
      ),
    [plan],
  );

  const planSnapshot = useMemo(() => JSON.stringify(plan), [plan]);
  const hasUnsavedChanges = planSnapshot !== lastSavedSnapshot;

  const updateWorkout = (day: string, workoutId: string, changes: Partial<WorkoutItem>) => {
    setPlan((current) => ({
      ...current,
      [day]: {
        items: current[day].items.map((item) =>
          item.id === workoutId ? { ...item, ...changes } : item,
        ),
      },
    }));
  };

  const addWorkout = (day: string, exerciseId = "") => {
    setPlan((current) => ({
      ...current,
      [day]: {
        items: [...current[day].items, createItem(exerciseId)],
      },
    }));
  };

  const removeWorkout = (day: string, workoutId: string) => {
    setPlan((current) => ({
      ...current,
      [day]: {
        items: current[day].items.filter((item) => item.id !== workoutId),
      },
    }));
  };

  const savePlan = () => {
    window.localStorage.setItem(plannerStorageKey, planSnapshot);
    setLastSavedSnapshot(planSnapshot);
    setSavedAt(new Date());
  };

  const resetPlan = () => {
    setPlan(emptyDraft);
  };

  const suggestionsByDay = useMemo(() => {
    const usedInWeek = new Set(
      weekdays.flatMap((day) => plan[day].items.map((item) => item.exerciseId).filter(Boolean)),
    );

    return Object.fromEntries(
      weekdays.map((day, index) => {
        const items = plan[day].items;
        const anchor = items
          .map((item) => exerciseById.get(item.exerciseId))
          .find((exercise) => Boolean(exercise?.primaryMuscles?.[0]));

        const preferredMuscle = (anchor?.primaryMuscles?.[0] || dayFocus[index]).toLowerCase();

        const scored = exerciseOptions
          .filter((exercise) => !items.some((item) => item.exerciseId === exercise.id))
          .map((exercise) => {
            const muscleText = exercise.primaryMuscles.join(" ").toLowerCase();
            const categoryText = exercise.category.toLowerCase();
            let score = 0;
            if (muscleText.includes(preferredMuscle)) score += 5;
            if (categoryText.includes("strength")) score += 1;
            if (!usedInWeek.has(exercise.id)) score += 2;
            return { exercise, score };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((entry) => entry.exercise);

        return [day, scored];
      }),
    ) as Record<string, Exercise[]>;
  }, [exerciseById, exerciseOptions, plan]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-amber-100 via-orange-50 to-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
          Weekly Split Builder
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
          Planner
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-700 sm:text-base">
          Stack multiple workouts each day and use suggestions to fill your week faster.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-600">Planned days</p>
            <p className="text-2xl font-bold text-slate-900">
              {summary}
              <span className="text-base font-medium text-slate-500"> / 7</span>
            </p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-sm font-medium text-slate-600">Stacked workouts</p>
            <p className="text-2xl font-bold text-slate-900">{totalWorkouts}</p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-sm font-medium text-slate-600">Total sets</p>
            <p className="text-2xl font-bold text-slate-900">{totalSets}</p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300"
            style={{ width: `${(summary / 7) * 100}%` }}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={savePlan}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Save plan
          </button>
          <button
            type="button"
            onClick={resetPlan}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          >
            Reset
          </button>
          <span className="text-xs text-slate-500 sm:text-sm">
            {savedAt
              ? `Last saved at ${savedAt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "Not saved yet"}
          </span>
          {hasUnsavedChanges ? (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
              Unsaved changes
            </span>
          ) : null}
        </div>
      </section>

      {isLoading ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Loading exercises...
        </p>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {weekdays.map((day) => {
            const dayItems = plan[day].items;
            const activeCount = dayItems.filter((item) => item.exerciseId.trim()).length;
            const suggestions = suggestionsByDay[day] ?? [];

            return (
              <article
                key={day}
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-bold text-slate-900">{day}</h2>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      activeCount > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {activeCount > 0 ? `${activeCount} stacked` : "Rest"}
                  </span>
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Suggestions
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {suggestions.map((exercise) => (
                      <button
                        key={exercise.id}
                        type="button"
                        onClick={() => addWorkout(day, exercise.id)}
                        className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-800 transition hover:bg-orange-100"
                      >
                        + {exercise.name}
                      </button>
                    ))}
                    {suggestions.length === 0 ? (
                      <p className="text-xs text-slate-500">No suggestions available.</p>
                    ) : null}
                  </div>
                </div>

                {dayItems.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => addWorkout(day)}
                    className="w-full rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    + Add workout
                  </button>
                ) : null}

                {dayItems.map((item, index) => {
                  const selectedExercise = exerciseById.get(item.exerciseId);
                  return (
                    <div key={item.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">Workout {index + 1}</p>
                        <button
                          type="button"
                          onClick={() => removeWorkout(day, item.id)}
                          className="text-xs font-semibold text-rose-700 transition hover:text-rose-900"
                        >
                          Remove
                        </button>
                      </div>

                      <label className="block space-y-1 text-sm text-slate-700">
                        Exercise
                        <select
                          value={item.exerciseId}
                          onChange={(event) =>
                            updateWorkout(day, item.id, { exerciseId: event.target.value })
                          }
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 transition focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                        >
                          <option value="">Select exercise</option>
                          {exerciseOptions.map((exercise) => (
                            <option key={exercise.id} value={exercise.id}>
                              {exercise.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      {selectedExercise ? (
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
                            {selectedExercise.category}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
                            {selectedExercise.equipment || "Bodyweight"}
                          </span>
                          {selectedExercise.primaryMuscles?.[0] ? (
                            <span className="rounded-full bg-orange-100 px-2 py-1 font-medium text-orange-800">
                              {selectedExercise.primaryMuscles[0]}
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block space-y-1 text-sm text-slate-700">
                          Sets
                          <input
                            type="number"
                            min={1}
                            value={item.sets}
                            onChange={(event) =>
                              updateWorkout(day, item.id, {
                                sets: Number.parseInt(event.target.value || "1", 10),
                              })
                            }
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 transition focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                          />
                        </label>
                        <label className="block space-y-1 text-sm text-slate-700">
                          Reps
                          <input
                            value={item.reps}
                            onChange={(event) => updateWorkout(day, item.id, { reps: event.target.value })}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 transition focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}

                {dayItems.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => addWorkout(day)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    + Add another workout
                  </button>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
n