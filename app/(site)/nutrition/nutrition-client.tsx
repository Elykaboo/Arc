"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  estimatePhotoNutrition,
  fetchNutritionDashboard,
} from "@/lib/nutrition-client";
import { scaleEstimatedItemByGrams, sumEstimatedItems } from "@/lib/nutrition-estimate";
import type { LoggedFoodEntry, LoggedMeal, MacroTargets, NutritionDashboardResponse, PhotoMacroEstimateItem } from "@/types/nutrition";

type EstimateDraftItem = PhotoMacroEstimateItem & {
  base: PhotoMacroEstimateItem;
};

const todayKey = () => new Date().toISOString().slice(0, 10);
const round = (value: number) => Math.round(value * 10) / 10;
const formatNumber = (value: number) => round(value).toLocaleString();
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const parsePositiveNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const createEntryId = () => `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const localMealsKey = (date: string) => `arc:nutrition:local-meals:${date}`;

const emptyMacros = (): MacroTargets => ({
  calories: 0,
  proteinGrams: 0,
  carbsGrams: 0,
  fatGrams: 0,
});

const addMacros = (left: MacroTargets, right: MacroTargets): MacroTargets => ({
  calories: round(left.calories + right.calories),
  proteinGrams: round(left.proteinGrams + right.proteinGrams),
  carbsGrams: round(left.carbsGrams + right.carbsGrams),
  fatGrams: round(left.fatGrams + right.fatGrams),
});

const calculateMealTotals = (entries: LoggedFoodEntry[]): MacroTargets =>
  entries.reduce(
    (totals, entry) =>
      addMacros(totals, {
        calories: entry.calories,
        proteinGrams: entry.proteinGrams,
        carbsGrams: entry.carbsGrams,
        fatGrams: entry.fatGrams,
      }),
    emptyMacros(),
  );

const calculateDayTotals = (meals: LoggedMeal[]): MacroTargets =>
  meals.reduce((totals, meal) => addMacros(totals, calculateMealTotals(meal.entries)), emptyMacros());

const applyMealsToDashboard = (current: NutritionDashboardResponse, meals: LoggedMeal[]): NutritionDashboardResponse => {
  const recalculatedMeals = meals.map((meal) => ({
    ...meal,
    totals: calculateMealTotals(meal.entries),
  }));
  const totals = calculateDayTotals(recalculatedMeals);
  return {
    ...current,
    meals: recalculatedMeals,
    totals,
    remaining: {
      calories: round(current.targets.calories - totals.calories),
      proteinGrams: round(current.targets.proteinGrams - totals.proteinGrams),
      carbsGrams: round(current.targets.carbsGrams - totals.carbsGrams),
      fatGrams: round(current.targets.fatGrams - totals.fatGrams),
    },
  };
};

const loadLocalMeals = (date: string): LoggedMeal[] | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(localMealsKey(date));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LoggedMeal[]) : null;
  } catch {
    return null;
  }
};

const persistLocalMeals = (date: string, meals: LoggedMeal[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localMealsKey(date), JSON.stringify(meals));
};

const alignMealsToLatestSetup = (dashboard: NutritionDashboardResponse, localMeals: LoggedMeal[]): LoggedMeal[] => {
  const bySlotId = new Map(localMeals.map((meal) => [meal.slotId, meal]));
  const byLabel = new Map(localMeals.map((meal) => [meal.slotLabel.toLowerCase().trim(), meal]));

  return dashboard.mealSetup.slots.map((slot) => {
    const direct = bySlotId.get(slot.id);
    const fallbackByLabel = byLabel.get(slot.label.toLowerCase().trim());
    const source = direct ?? fallbackByLabel;
    const entries = (source?.entries ?? []).map((entry) => ({
      ...entry,
      mealSlotId: slot.id,
      mealSlotLabelSnapshot: slot.label,
    }));
    return {
      slotId: slot.id,
      slotLabel: slot.label,
      entries,
      totals: calculateMealTotals(entries),
    };
  });
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new Error("Could not read the selected image."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });

function MetricPill({
  label,
  value,
  tone,
  animate,
}: {
  label: string;
  value: string;
  tone: "sky" | "violet" | "amber";
  animate?: boolean;
}) {
  const toneClass =
    tone === "sky"
      ? "bg-sky-100 text-sky-900 ring-sky-300/70"
      : tone === "violet"
        ? "bg-indigo-100 text-indigo-900 ring-indigo-300/70"
        : "bg-amber-100 text-amber-900 ring-amber-300/70";

  return (
    <div className={`rounded-xl px-3 py-2 ring-1 transition-all duration-500 ${toneClass} ${animate ? "nutrition-add-burst" : ""}`}>
      <p className="text-[10px] uppercase tracking-[0.16em] opacity-80">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

export default function NutritionClient() {
  const [date] = useState(todayKey);
  const [dashboard, setDashboard] = useState<NutritionDashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [selectedSlotId, setSelectedSlotId] = useState("");

  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const [draftItems, setDraftItems] = useState<EstimateDraftItem[]>([]);
  const [activeMealSlotId, setActiveMealSlotId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryQuantityInput, setEntryQuantityInput] = useState("1");
  const [entrySlotIdInput, setEntrySlotIdInput] = useState("");
  const [entryActionError, setEntryActionError] = useState<string | null>(null);
  const [entryActionLoading, setEntryActionLoading] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [addFoodAnimating, setAddFoodAnimating] = useState(false);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddServingGrams, setQuickAddServingGrams] = useState("100");
  const [quickAddCalories, setQuickAddCalories] = useState("");
  const [quickAddProtein, setQuickAddProtein] = useState("");
  const [quickAddCarbs, setQuickAddCarbs] = useState("");
  const [quickAddFat, setQuickAddFat] = useState("");

  const draftTotals = useMemo(() => sumEstimatedItems(draftItems), [draftItems]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setDashboardLoading(true);
      setDashboardError(null);
      try {
        const next = await fetchNutritionDashboard(date);
        if (cancelled) return;
        const localMeals = loadLocalMeals(date);
        const merged = localMeals ? applyMealsToDashboard(next, alignMealsToLatestSetup(next, localMeals)) : next;
        setDashboard(merged);
        if (localMeals) {
          persistLocalMeals(date, merged.meals);
        }
        setSelectedSlotId((current) => {
          if (current && merged.mealSetup.slots.some((slot) => slot.id === current)) return current;
          return merged.mealSetup.slots[0]?.id ?? "";
        });
      } catch (error) {
        if (cancelled) return;
        setDashboardError(error instanceof Error ? error.message : "Unable to load nutrition dashboard.");
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [date]);

  const selectedSlotLabel =
    dashboard?.mealSetup.slots.find((slot) => slot.id === selectedSlotId)?.label ??
    dashboard?.mealSetup.slots[0]?.label ??
    "Meal";

  const targetCalories = dashboard?.targets.calories ?? 0;
  const consumedCalories = dashboard?.totals.calories ?? 0;
  const remainingCalories = dashboard?.remaining.calories ?? 0;
  const calorieProgress = targetCalories > 0 ? clamp(consumedCalories / targetCalories, 0, 1) : 0;
  const calorieRingStyle = {
    background: `conic-gradient(from 0deg, #38bdf8 ${Math.round(calorieProgress * 360)}deg, rgba(148, 163, 184, 0.2) ${Math.round(calorieProgress * 360)}deg 360deg)`,
  };

  const loggedEntryCount = dashboard?.meals.reduce((sum, meal) => sum + meal.entries.length, 0) ?? 0;

  const onSelectPhoto: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    void (async () => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setEstimateError("Please select an image file.");
        return;
      }

      setEstimateError(null);
      setDraftItems([]);
      try {
        setPhotoDataUrl(await readFileAsDataUrl(file));
      } catch (error) {
        setEstimateError(error instanceof Error ? error.message : "Unable to read selected photo.");
      }
    })();
  };

  const runEstimate = async () => {
    if (!photoDataUrl.trim()) {
      setEstimateError("Upload a food photo before estimating.");
      return;
    }

    setEstimateLoading(true);
    setEstimateError(null);
    try {
      const result = await estimatePhotoNutrition({ imageDataUrl: photoDataUrl });
      setDraftItems(result.items.map((item) => ({ ...item, base: { ...item } })));
    } catch (error) {
      setEstimateError(error instanceof Error ? error.message : "Unable to estimate this meal.");
    } finally {
      setEstimateLoading(false);
    }
  };

  const updateItemGrams = (itemId: string, gramsInput: string) => {
    const parsed = Number(gramsInput);
    if (!Number.isFinite(parsed)) return;

    setDraftItems((current) =>
      current.map((item) =>
        item.id === itemId ? { ...scaleEstimatedItemByGrams(item.base, parsed), base: item.base } : item,
      ),
    );
  };

  const saveEstimate = async () => {
    if (!dashboard) {
      setEstimateError("Dashboard is not loaded yet.");
      return;
    }
    if (!selectedSlotId) {
      setEstimateError("Select a meal slot first.");
      return;
    }
    if (draftItems.length === 0) {
      setEstimateError("Estimate a meal first.");
      return;
    }

    setSaveLoading(true);
    setEstimateError(null);
    try {
      const payload = draftItems.map((item) => ({
        mealSlotId: selectedSlotId,
        mealSlotLabel: selectedSlotLabel,
        entryType: "catalog" as const,
        sourceId: null,
        quantity: 1,
        name: item.name,
        servingLabel: `${formatNumber(item.grams)} g`,
        calories: item.calories,
        proteinGrams: item.proteinGrams,
        carbsGrams: item.carbsGrams,
        fatGrams: item.fatGrams,
      }));

      const nowIso = new Date().toISOString();
      const entriesToAdd: LoggedFoodEntry[] = payload.map((item) => ({
        id: createEntryId(),
        entryType: item.entryType,
        sourceId: item.sourceId ?? null,
        name: item.name ?? "Food",
        servingLabel: item.servingLabel ?? "1 serving",
        quantity: item.quantity ?? 1,
        calories: item.calories ?? 0,
        proteinGrams: item.proteinGrams ?? 0,
        carbsGrams: item.carbsGrams ?? 0,
        fatGrams: item.fatGrams ?? 0,
        mealSlotId: selectedSlotId,
        mealSlotLabelSnapshot: selectedSlotLabel,
        loggedAt: nowIso,
        createdFromPlan: false,
      }));
      const nextMeals = dashboard.meals.map((meal) =>
        meal.slotId === selectedSlotId ? { ...meal, entries: [...meal.entries, ...entriesToAdd] } : meal,
      );
      const next = applyMealsToDashboard(dashboard, nextMeals);
      setDashboard(next);
      persistLocalMeals(date, next.meals);
      setAddFoodAnimating(true);
      window.setTimeout(() => setAddFoodAnimating(false), 520);
      setDraftItems([]);
      setPhotoDataUrl("");
      setSelectedSlotId((current) => {
        if (current && next.mealSetup.slots.some((slot) => slot.id === current)) return current;
        return next.mealSetup.slots[0]?.id ?? "";
      });
    } catch (error) {
      setEstimateError(error instanceof Error ? error.message : "Unable to save meal estimate.");
    } finally {
      setSaveLoading(false);
    }
  };

  const activeMeal = dashboard?.meals.find((meal) => meal.slotId === activeMealSlotId) ?? null;
  const editingEntry =
    editingEntryId && activeMeal ? activeMeal.entries.find((entry) => entry.id === editingEntryId) ?? null : null;

  const openMealOverlay = (mealSlotId: string) => {
    setActiveMealSlotId(mealSlotId);
    setEditingEntryId(null);
    setEntryActionError(null);
    setQuickAddName("");
    setQuickAddServingGrams("100");
    setQuickAddCalories("");
    setQuickAddProtein("");
    setQuickAddCarbs("");
    setQuickAddFat("");
  };

  const closeMealOverlay = () => {
    setActiveMealSlotId(null);
    setEditingEntryId(null);
    setEntryActionError(null);
  };

  const startEditingEntry = (entry: LoggedFoodEntry) => {
    setEditingEntryId(entry.id);
    setEntryQuantityInput(String(round(entry.quantity)));
    setEntrySlotIdInput(entry.mealSlotId);
    setEntryActionError(null);
  };

  const saveEntryEdit = async () => {
    if (!editingEntry) return;
    const nextQuantity = Number(entryQuantityInput);
    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
      setEntryActionError("Quantity must be greater than 0.");
      return;
    }
    if (!entrySlotIdInput.trim()) {
      setEntryActionError("Select a meal slot.");
      return;
    }

    setEntryActionLoading(true);
    setEntryActionError(null);
    try {
      if (!dashboard) return;
      const ratio = nextQuantity / Math.max(editingEntry.quantity, 0.1);
      const updatedEntry: LoggedFoodEntry = {
        ...editingEntry,
        quantity: round(nextQuantity),
        mealSlotId: entrySlotIdInput,
        mealSlotLabelSnapshot:
          dashboard.mealSetup.slots.find((slot) => slot.id === entrySlotIdInput)?.label ?? editingEntry.mealSlotLabelSnapshot,
        calories: round(editingEntry.calories * ratio),
        proteinGrams: round(editingEntry.proteinGrams * ratio),
        carbsGrams: round(editingEntry.carbsGrams * ratio),
        fatGrams: round(editingEntry.fatGrams * ratio),
      };

      const nextMeals = dashboard.meals.map((meal) => ({
        ...meal,
        entries: meal.entries.filter((entry) => entry.id !== editingEntry.id),
      }));
      const targetMeal = nextMeals.find((meal) => meal.slotId === entrySlotIdInput);
      if (targetMeal) {
        targetMeal.entries.push(updatedEntry);
      }

      const next = applyMealsToDashboard(dashboard, nextMeals);
      setDashboard(next);
      persistLocalMeals(date, next.meals);
      setActiveMealSlotId(entrySlotIdInput);
      setEditingEntryId(null);
    } catch (error) {
      setEntryActionError(error instanceof Error ? error.message : "Unable to update entry.");
    } finally {
      setEntryActionLoading(false);
    }
  };

  const removeEntry = async (entryId: string) => {
    setEntryActionLoading(true);
    setDeletingEntryId(entryId);
    setEntryActionError(null);
    try {
      if (!dashboard) return;
      const nextMeals = dashboard.meals.map((meal) => ({
        ...meal,
        entries: meal.entries.filter((entry) => entry.id !== entryId),
      }));
      const next = applyMealsToDashboard(dashboard, nextMeals);
      setDashboard(next);
      persistLocalMeals(date, next.meals);
      if (editingEntryId === entryId) {
        setEditingEntryId(null);
      }
    } catch (error) {
      setEntryActionError(error instanceof Error ? error.message : "Unable to delete entry.");
    } finally {
      setDeletingEntryId(null);
      setEntryActionLoading(false);
    }
  };

  const addQuickFoodToMeal = async () => {
    if (!dashboard || !activeMeal) return;

    const calories = parsePositiveNumber(quickAddCalories);
    const protein = parsePositiveNumber(quickAddProtein) ?? 0;
    const carbs = parsePositiveNumber(quickAddCarbs) ?? 0;
    const fat = parsePositiveNumber(quickAddFat) ?? 0;
    const servingGrams = parsePositiveNumber(quickAddServingGrams) ?? 100;
    const name = quickAddName.trim();

    if (!name) {
      setEntryActionError("Food name is required.");
      return;
    }
    if (!calories) {
      setEntryActionError("Calories must be greater than 0.");
      return;
    }

    setEntryActionLoading(true);
    setEntryActionError(null);
    try {
      const nowIso = new Date().toISOString();
      const newEntry: LoggedFoodEntry = {
        id: createEntryId(),
        entryType: "custom_food",
        sourceId: null,
        name,
        servingLabel: `${round(servingGrams)} g`,
        quantity: 1,
        calories: round(calories),
        proteinGrams: round(protein),
        carbsGrams: round(carbs),
        fatGrams: round(fat),
        mealSlotId: activeMeal.slotId,
        mealSlotLabelSnapshot: activeMeal.slotLabel,
        loggedAt: nowIso,
        createdFromPlan: false,
      };

      const nextMeals = dashboard.meals.map((meal) =>
        meal.slotId === activeMeal.slotId ? { ...meal, entries: [...meal.entries, newEntry] } : meal,
      );
      const next = applyMealsToDashboard(dashboard, nextMeals);
      setDashboard(next);
      persistLocalMeals(date, next.meals);
      setAddFoodAnimating(true);
      window.setTimeout(() => setAddFoodAnimating(false), 520);
      setQuickAddName("");
      setQuickAddCalories("");
      setQuickAddProtein("");
      setQuickAddCarbs("");
      setQuickAddFat("");
    } catch (error) {
      setEntryActionError(error instanceof Error ? error.message : "Unable to add food to meal slot.");
    } finally {
      setEntryActionLoading(false);
    }
  };

  if (dashboardLoading) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white/90 text-slate-900 shadow-[0_24px_64px_rgba(15,23,42,0.14)]">
          <div className="bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_42%),radial-gradient(circle_at_top_left,rgba(249,115,22,0.14),transparent_34%),linear-gradient(180deg,#f8fbff_0%,#f6f8fc_100%)] p-5 sm:p-7">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="h-3 w-28 animate-pulse rounded bg-slate-300" />
                <div className="h-8 w-72 animate-pulse rounded bg-slate-300" />
                <div className="h-4 w-80 animate-pulse rounded bg-slate-200" />
              </div>
              <div className="h-8 w-28 animate-pulse rounded-full bg-slate-300" />
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
              <article className="rounded-2xl border border-slate-200 bg-white/85 p-5">
                <div className="grid gap-5 sm:grid-cols-[220px_1fr] sm:items-center">
                  <div className="mx-auto h-52 w-52 animate-pulse rounded-full border-[20px] border-slate-300/80" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
                    <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
                    <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
                    <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white/85 p-5">
                <div className="space-y-3">
                  <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
                  <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
                  <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
                </div>
              </article>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
              <div className="rounded-2xl border border-slate-200 bg-white/85 p-5">
                <div className="h-10 w-60 animate-pulse rounded bg-slate-200" />
                <div className="mt-4 space-y-2">
                  <div className="h-14 animate-pulse rounded-lg bg-slate-200" />
                  <div className="h-14 animate-pulse rounded-lg bg-slate-200" />
                  <div className="h-14 animate-pulse rounded-lg bg-slate-200" />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/85 p-5">
                <div className="h-10 w-44 animate-pulse rounded bg-slate-200" />
                <div className="mt-4 space-y-2">
                  <div className="h-16 animate-pulse rounded-lg bg-slate-200" />
                  <div className="h-16 animate-pulse rounded-lg bg-slate-200" />
                  <div className="h-16 animate-pulse rounded-lg bg-slate-200" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (dashboardError || !dashboard) {
    return <p className="px-6 py-8 text-sm text-rose-700">{dashboardError ?? "Unable to load nutrition dashboard."}</p>;
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white/90 text-slate-900 shadow-[0_24px_64px_rgba(15,23,42,0.14)]">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_42%),radial-gradient(circle_at_top_left,rgba(249,115,22,0.14),transparent_34%),linear-gradient(180deg,#f8fbff_0%,#f6f8fc_100%)] p-5 sm:p-7">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Arc Nutrition</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Fuel Command Center</h1>
              <p className="mt-1 text-sm text-slate-600">AI-assisted tracking with editable portions and instant macro updates.</p>
            </div>
            <div className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-800">
              {date}
            </div>
          </header>

          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <article className="rounded-2xl border border-slate-200 bg-white/85 p-5 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Calories</p>
                  <p className="mt-1 text-sm text-slate-600">Remaining = Goal - Food</p>
                </div>
                <button className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">Today</button>
              </div>

              <div className="mt-4 grid gap-5 sm:grid-cols-[220px_1fr] sm:items-center">
                <div className={`mx-auto grid h-52 w-52 place-items-center rounded-full p-4 transition-all duration-500 ${addFoodAnimating ? "nutrition-add-burst" : ""}`} style={calorieRingStyle}>
                  <div className="grid h-full w-full place-items-center rounded-full bg-white text-center ring-1 ring-slate-200">
                    <div>
                      <p className="text-4xl font-black text-slate-900">{formatNumber(remainingCalories)}</p>
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Remaining</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricPill label="Base Goal" value={`${formatNumber(targetCalories)} kcal`} tone="sky" animate={addFoodAnimating} />
                  <MetricPill label="Food" value={`${formatNumber(consumedCalories)} kcal`} tone="violet" animate={addFoodAnimating} />
                  <MetricPill label="Logged Entries" value={`${loggedEntryCount}`} tone="amber" animate={addFoodAnimating} />
                  <MetricPill label="Meals" value={`${dashboard.meals.filter((meal) => meal.entries.length > 0).length}/${dashboard.meals.length}`} tone="sky" animate={addFoodAnimating} />
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white/85 p-5 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Macro Snapshot</p>
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Protein</p>
                  <p className="mt-1 text-lg font-semibold text-sky-800">
                    {formatNumber(dashboard.totals.proteinGrams)}g <span className="text-sm text-slate-500">/ {formatNumber(dashboard.targets.proteinGrams)}g</span>
                  </p>
                </div>
                <div className="rounded-xl bg-indigo-50 p-3 ring-1 ring-indigo-200">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Carbs</p>
                  <p className="mt-1 text-lg font-semibold text-indigo-800">
                    {formatNumber(dashboard.totals.carbsGrams)}g <span className="text-sm text-slate-500">/ {formatNumber(dashboard.targets.carbsGrams)}g</span>
                  </p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Fat</p>
                  <p className="mt-1 text-lg font-semibold text-amber-800">
                    {formatNumber(dashboard.totals.fatGrams)}g <span className="text-sm text-slate-500">/ {formatNumber(dashboard.targets.fatGrams)}g</span>
                  </p>
                </div>
              </div>
            </article>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <article className="rounded-2xl border border-slate-200 bg-white/85 p-5 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Gemini Lens</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">Photo Analyzer</h2>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                  Choose Photo
                  <input type="file" accept="image/*" onChange={onSelectPhoto} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={() => void runEstimate()}
                  disabled={estimateLoading || !photoDataUrl}
                  className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {estimateLoading ? "Estimating..." : "Estimate Food"}
                </button>
              </div>

              {estimateLoading ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-sky-300" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400 [animation-delay:120ms]" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500 [animation-delay:240ms]" />
                    <p className="ml-2 text-xs uppercase tracking-[0.14em] text-slate-600">Analyzing your meal...</p>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="h-14 animate-pulse rounded-lg bg-slate-200" />
                    <div className="h-14 animate-pulse rounded-lg bg-slate-200" />
                    <div className="h-14 animate-pulse rounded-lg bg-slate-200" />
                  </div>
                </div>
              ) : null}

              {photoDataUrl ? (
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  <Image src={photoDataUrl} alt="Selected food" width={1200} height={600} className="h-44 w-full object-cover" />
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  Upload a meal photo to start AI portion estimation.
                </div>
              )}

              {estimateError ? <p className="mt-3 text-sm text-rose-700">{estimateError}</p> : null}

              {draftItems.length > 0 ? (
                <div className="mt-5 space-y-3">
                  {draftItems.map((item) => (
                    <div key={item.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">{formatNumber(item.calories)} kcal</p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <label htmlFor={`grams-${item.id}`} className="text-xs uppercase tracking-[0.12em] text-slate-500">
                          Portion
                        </label>
                        <input
                          id={`grams-${item.id}`}
                          type="number"
                          min={1}
                          step="1"
                          value={item.grams}
                          onChange={(event) => updateItemGrams(item.id, event.target.value)}
                          className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
                        />
                        <span className="text-xs text-slate-500">grams</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        P {formatNumber(item.proteinGrams)}g • C {formatNumber(item.carbsGrams)}g • F {formatNumber(item.fatGrams)}g
                      </p>
                    </div>
                  ))}

                  <div className="rounded-xl bg-gradient-to-r from-sky-50 via-indigo-50 to-amber-50 p-3 ring-1 ring-slate-200">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Estimated Total</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {formatNumber(draftTotals.calories)} kcal • P {formatNumber(draftTotals.proteinGrams)}g • C {formatNumber(draftTotals.carbsGrams)}g • F {formatNumber(draftTotals.fatGrams)}g
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      value={selectedSlotId}
                      onChange={(event) => setSelectedSlotId(event.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      {dashboard.mealSetup.slots.map((slot) => (
                        <option key={slot.id} value={slot.id}>
                          {slot.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void saveEstimate()}
                      disabled={saveLoading}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saveLoading ? "Saving..." : `Confirm & Save to ${selectedSlotLabel}`}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white/85 p-5 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Today&apos;s Log</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">Meal Timeline</h2>
              <p className="mt-1 text-xs text-slate-500">Click a meal to edit or delete its entries.</p>
              <div className="mt-4 space-y-3">
                {dashboard.meals.map((meal) => (
                  <button
                    key={meal.slotId}
                    type="button"
                    onClick={() => openMealOverlay(meal.slotId)}
                    className="w-full rounded-xl bg-slate-50 p-3 text-left ring-1 ring-slate-200 transition hover:bg-white hover:ring-slate-300"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{meal.slotLabel}</p>
                      <span className="text-[11px] text-slate-500">{meal.entries.length} item{meal.entries.length === 1 ? "" : "s"}</span>
                    </div>
                    {meal.entries.length === 0 ? (
                      <p className="mt-2 text-xs text-slate-500">No entries yet.</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {meal.entries.slice(0, 4).map((entry) => (
                          <li key={entry.id} className="text-xs text-slate-600">
                            <span className="font-medium text-slate-800">{entry.name}</span> - {entry.servingLabel} - {formatNumber(entry.calories)} kcal
                          </li>
                        ))}
                        {meal.entries.length > 4 ? (
                          <li className="text-xs text-slate-500">+{meal.entries.length - 4} more</li>
                        ) : null}
                      </ul>
                    )}
                  </button>
                ))}
              </div>
            </article>
          </div>
        </div>
      </div>

      {activeMeal ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] p-3 sm:items-center sm:p-6" onClick={closeMealOverlay}>
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-[0_24px_56px_rgba(15,23,42,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Meal Editor</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">{activeMeal.slotLabel}</h3>
              </div>
              <button
                type="button"
                onClick={closeMealOverlay}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Quick Add to {activeMeal.slotLabel}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={quickAddName}
                  onChange={(event) => setQuickAddName(event.target.value)}
                  placeholder="Food name"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                />
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quickAddServingGrams}
                  onChange={(event) => setQuickAddServingGrams(event.target.value)}
                  placeholder="Serving grams"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                />
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quickAddCalories}
                  onChange={(event) => setQuickAddCalories(event.target.value)}
                  placeholder="Calories"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                />
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={quickAddProtein}
                  onChange={(event) => setQuickAddProtein(event.target.value)}
                  placeholder="Protein (g)"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                />
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={quickAddCarbs}
                  onChange={(event) => setQuickAddCarbs(event.target.value)}
                  placeholder="Carbs (g)"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                />
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={quickAddFat}
                  onChange={(event) => setQuickAddFat(event.target.value)}
                  placeholder="Fat (g)"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                />
              </div>
              <button
                type="button"
                onClick={() => void addQuickFoodToMeal()}
                disabled={entryActionLoading}
                className="mt-3 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-60"
              >
                {entryActionLoading ? "Adding..." : "Add to Meal Slot"}
              </button>
            </div>

            {activeMeal.entries.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No entries in this meal yet.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {activeMeal.entries.map((entry) => (
                  <div key={entry.id} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{entry.name}</p>
                        <p className="text-xs text-slate-500">
                          {entry.servingLabel} • {formatNumber(entry.calories)} kcal
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEditingEntry(entry)}
                          disabled={entryActionLoading}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeEntry(entry.id)}
                          disabled={entryActionLoading}
                          className="rounded-md border border-rose-400/40 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/10 disabled:opacity-60"
                        >
                          {deletingEntryId === entry.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                    {deletingEntryId === entry.id ? (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full w-1/2 animate-pulse rounded-full bg-rose-300/70" />
                        </div>
                      ) : null}
                  </div>
                ))}
              </div>
            )}

            {editingEntry ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Edit Entry</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{editingEntry.name}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="entry-qty-input">
                      Quantity multiplier
                    </label>
                    <input
                      id="entry-qty-input"
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={entryQuantityInput}
                      onChange={(event) => setEntryQuantityInput(event.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="entry-slot-input">
                      Move to meal
                    </label>
                    <select
                      id="entry-slot-input"
                      value={entrySlotIdInput}
                      onChange={(event) => setEntrySlotIdInput(event.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      {dashboard.mealSetup.slots.map((slot) => (
                        <option key={slot.id} value={slot.id}>
                          {slot.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void saveEntryEdit()}
                    disabled={entryActionLoading}
                    className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-60"
                  >
                    {entryActionLoading ? "Saving..." : "Save changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingEntryId(null)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {entryActionError ? <p className="mt-3 text-xs text-rose-700">{entryActionError}</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
