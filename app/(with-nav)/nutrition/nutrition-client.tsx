"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/authenticated-fetch";
import { auth } from "@/lib/firebase";
import type {
  ActiveNutritionPlan,
  CreateDiaryEntryRequest,
  CustomFood,
  CustomFoodInput,
  DiaryEntry,
  FoodCatalogItem,
  FoodCategory,
  MealSlot,
  MealTag,
  NutritionDiaryDay,
} from "@/types/nutrition";

type PickerTab = "search" | "custom";

type CustomFoodFormState = {
  name: string;
  servingLabel: string;
  category: FoodCategory;
  mealTags: MealTag[];
  calories: string;
  proteinGrams: string;
  carbsGrams: string;
  fatGrams: string;
};

type EntryDraftMap = Record<
  string,
  {
    quantity: string;
    mealSlot: MealSlot;
  }
>;

const mealSlots: Array<{ value: MealSlot; label: string }> = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack1", label: "Snack" },
  { value: "snack2", label: "Snack 2" },
];

const foodCategories: Array<{ value: FoodCategory; label: string }> = [
  { value: "protein", label: "Protein" },
  { value: "carb", label: "Carb" },
  { value: "fat", label: "Fat" },
  { value: "fruit", label: "Fruit" },
  { value: "vegetable", label: "Vegetable" },
  { value: "dairy", label: "Dairy" },
  { value: "mixed", label: "Mixed" },
];

const mealTagOptions: Array<{ value: MealTag; label: string }> = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

const createEmptyCustomFoodForm = (): CustomFoodFormState => ({
  name: "",
  servingLabel: "",
  category: "mixed",
  mealTags: ["lunch"],
  calories: "",
  proteinGrams: "",
  carbsGrams: "",
  fatGrams: "",
});

const todayString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildCustomFoodPayload = (form: CustomFoodFormState): CustomFoodInput => ({
  name: form.name.trim(),
  servingLabel: form.servingLabel.trim(),
  category: form.category,
  mealTags: form.mealTags,
  calories: Number(form.calories),
  proteinGrams: Number(form.proteinGrams),
  carbsGrams: Number(form.carbsGrams),
  fatGrams: Number(form.fatGrams),
});

const createEntryDrafts = (diary: NutritionDiaryDay | null): EntryDraftMap => {
  if (!diary) return {};

  return Object.fromEntries(
    diary.entriesByMeal
      .flatMap((meal) => meal.entries)
      .map((entry) => [
        entry.entryId,
        {
          quantity: entry.quantity.toString(),
          mealSlot: entry.mealSlot,
        },
      ]),
  );
};

const totalEntries = (diary: NutritionDiaryDay | null) =>
  diary ? diary.entriesByMeal.reduce((sum, meal) => sum + meal.entries.length, 0) : 0;

export default function NutritionClient() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [plan, setPlan] = useState<ActiveNutritionPlan | null>(null);
  const [diary, setDiary] = useState<NutritionDiaryDay | null>(null);
  const [customFoods, setCustomFoods] = useState<CustomFood[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayString);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRefreshingInsight, setIsRefreshingInsight] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [entryDrafts, setEntryDrafts] = useState<EntryDraftMap>({});

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerMealSlot, setPickerMealSlot] = useState<MealSlot>("breakfast");
  const [pickerTab, setPickerTab] = useState<PickerTab>("search");
  const [pickerQuantity, setPickerQuantity] = useState("1");
  const [foodSearch, setFoodSearch] = useState("");
  const [foodResults, setFoodResults] = useState<FoodCatalogItem[]>([]);
  const [isSearchingFoods, setIsSearchingFoods] = useState(false);

  const [customFoodSearch, setCustomFoodSearch] = useState("");
  const [isCustomFoodModalOpen, setIsCustomFoodModalOpen] = useState(false);
  const [customFoodForm, setCustomFoodForm] = useState<CustomFoodFormState>(createEmptyCustomFoodForm);
  const [editingCustomFoodId, setEditingCustomFoodId] = useState<string | null>(null);
  const [isSavingCustomFood, setIsSavingCustomFood] = useState(false);

  const loadInitialData = useEffectEvent(async (date: string) => {
    setIsLoading(true);

    try {
      await Promise.all([loadPlan(), loadDiary(date), loadCustomFoods()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load your nutrition page.");
    } finally {
      setIsLoading(false);
    }
  });

  const loadCustomFoods = async (search?: string) => {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (search?.trim()) params.set("search", search.trim());
    const response = await fetch(`/api/v1/nutrition/custom-foods${params.toString() ? `?${params.toString()}` : ""}`, {
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(errorData?.message || "Unable to load custom foods.");
    }

    const data = (await response.json()) as { items: CustomFood[] };
    setCustomFoods(data.items);
  };

  const loadDiary = async (date: string) => {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/v1/nutrition/diary?date=${encodeURIComponent(date)}`, {
      headers,
      cache: "no-store",
    });

    if (response.status === 404) {
      router.replace("/onboarding");
      return;
    }

    if (!response.ok) {
      const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(errorData?.message || "Unable to load diary.");
    }

    const data = (await response.json()) as { diary: NutritionDiaryDay };
    setDiary(data.diary);
  };

  const loadPlan = async () => {
    const headers = await getAuthHeaders();
    const response = await fetch("/api/v1/nutrition/plan", {
      headers,
      cache: "no-store",
    });

    if (response.status === 404) {
      router.replace("/onboarding");
      return;
    }

    if (response.status === 401) {
      router.replace("/login");
      return;
    }

    if (!response.ok) {
      const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(errorData?.message || "Unable to load your nutrition plan.");
    }

    const data = (await response.json()) as { plan: ActiveNutritionPlan };
    setPlan(data.plan);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setIsLoading(false);
        router.replace("/login");
        return;
      }

      setUser(nextUser);
    });

    return unsubscribe;
  }, [router]);

  useEffect(() => {
    if (!user) return;

    void loadInitialData(selectedDate);
  }, [user, selectedDate]);

  useEffect(() => {
    setEntryDrafts(createEntryDrafts(diary));
  }, [diary]);

  const refreshDiary = async (date = selectedDate) => {
    await loadDiary(date);
  };

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
      await refreshDiary();
      setStatus("Meal plan refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to regenerate your meal plan.");
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleFoodSearch = async () => {
    if (!foodSearch.trim()) {
      setFoodResults([]);
      return;
    }

    setIsSearchingFoods(true);
    setStatus(null);

    try {
      const response = await fetch(`/api/v1/foods?search=${encodeURIComponent(foodSearch.trim())}&limit=12`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorData?.message || "Unable to search foods.");
      }

      const data = (await response.json()) as { items: FoodCatalogItem[] };
      setFoodResults(data.items);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to search foods.");
    } finally {
      setIsSearchingFoods(false);
    }
  };

  const handleAddFood = async (food: FoodCatalogItem | CustomFood) => {
    setStatus(null);

    try {
      const headers = await getAuthHeaders();
      const payload: CreateDiaryEntryRequest = {
        date: selectedDate,
        mealSlot: pickerMealSlot,
        foodId: food.foodId,
        source: food.source,
        quantity: Number(pickerQuantity),
        food:
          food.source === "custom"
            ? undefined
            : {
                name: food.name,
                servingLabel: food.servingLabel,
                calories: food.calories,
                proteinGrams: food.proteinGrams,
                carbsGrams: food.carbsGrams,
                fatGrams: food.fatGrams,
              },
      };

      const response = await fetch("/api/v1/nutrition/diary/entries", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorData?.message || "Unable to add food.");
      }

      await refreshDiary();
      setPickerQuantity("1");
      setIsPickerOpen(false);
      setStatus(`${food.name} added to ${mealSlots.find((item) => item.value === pickerMealSlot)?.label.toLowerCase()}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to add food.");
    }
  };

  const handleSaveEntry = async (entry: DiaryEntry) => {
    const draft = entryDrafts[entry.entryId];
    if (!draft) return;

    setStatus(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/v1/nutrition/diary/entries/${encodeURIComponent(entry.entryId)}?date=${encodeURIComponent(selectedDate)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          quantity: Number(draft.quantity),
          mealSlot: draft.mealSlot,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorData?.message || "Unable to update entry.");
      }

      await refreshDiary();
      setStatus("Diary entry updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to update entry.");
    }
  };

  const handleDeleteEntry = async (entry: DiaryEntry) => {
    setStatus(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/v1/nutrition/diary/entries/${encodeURIComponent(entry.entryId)}?date=${encodeURIComponent(selectedDate)}`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorData?.message || "Unable to delete entry.");
      }

      await refreshDiary();
      setStatus("Diary entry deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to delete entry.");
    }
  };

  const openCreateCustomFoodModal = () => {
    setEditingCustomFoodId(null);
    setCustomFoodForm(createEmptyCustomFoodForm());
    setIsCustomFoodModalOpen(true);
  };

  const openEditCustomFoodModal = (food: CustomFood) => {
    setEditingCustomFoodId(food.foodId);
    setCustomFoodForm({
      name: food.name,
      servingLabel: food.servingLabel,
      category: food.category,
      mealTags: food.mealTags,
      calories: food.calories.toString(),
      proteinGrams: food.proteinGrams.toString(),
      carbsGrams: food.carbsGrams.toString(),
      fatGrams: food.fatGrams.toString(),
    });
    setIsCustomFoodModalOpen(true);
  };

  const handleSaveCustomFood = async () => {
    setStatus(null);
    setIsSavingCustomFood(true);

    try {
      const headers = await getAuthHeaders();
      const payload = buildCustomFoodPayload(customFoodForm);
      const response = await fetch(
        editingCustomFoodId
          ? `/api/v1/nutrition/custom-foods/${encodeURIComponent(editingCustomFoodId)}`
          : "/api/v1/nutrition/custom-foods",
        {
          method: editingCustomFoodId ? "PATCH" : "POST",
          headers,
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorData?.message || "Unable to save custom food.");
      }

      await loadCustomFoods(customFoodSearch);
      setIsCustomFoodModalOpen(false);
      setEditingCustomFoodId(null);
      setCustomFoodForm(createEmptyCustomFoodForm());
      setStatus(editingCustomFoodId ? "Custom food updated." : "Custom food created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save custom food.");
    } finally {
      setIsSavingCustomFood(false);
    }
  };

  const handleDeleteCustomFood = async (foodId: string) => {
    setStatus(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/v1/nutrition/custom-foods/${encodeURIComponent(foodId)}`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorData?.message || "Unable to delete custom food.");
      }

      await loadCustomFoods(customFoodSearch);
      setStatus("Custom food deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to delete custom food.");
    }
  };

  const handleRefreshInsight = async () => {
    setStatus(null);
    setIsRefreshingInsight(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/v1/nutrition/diary/insight?date=${encodeURIComponent(selectedDate)}`, {
        method: "POST",
        headers,
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorData?.message || "Unable to refresh insight.");
      }

      await refreshDiary();
      setStatus("Gemini insight refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to refresh insight.");
    } finally {
      setIsRefreshingInsight(false);
    }
  };

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Loading nutrition dashboard...
        </div>
      </section>
    );
  }

  if (!user || !plan || !diary) {
    return (
      <section className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Nutrition
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Nutrition dashboard unavailable
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {status || "Arc could not load your nutrition data right now."}
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
    <section className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Nutrition</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Daily diary and meal plan</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            Track what you actually eat, save personal foods, and compare the day against your Arc calorie and macro targets.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
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
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Calories target</p>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{plan.targets.calories}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Protein target</p>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{plan.targets.proteinGrams}g</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Carbs target</p>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{plan.targets.carbsGrams}g</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Fat target</p>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{plan.targets.fatGrams}g</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Daily diary</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{selectedDate}</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {totalEntries(diary)} logged foods across {diary.entriesByMeal.length} meal slots.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="nutrition-date" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    Selected date
                  </label>
                  <input
                    id="nutrition-date"
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRefreshInsight}
                  disabled={isRefreshingInsight || totalEntries(diary) === 0}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {isRefreshingInsight ? "Refreshing..." : "Refresh Gemini insight"}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Consumed</p>
                <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{diary.totals.calories} kcal</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  P {diary.totals.proteinGrams}g · C {diary.totals.carbsGrams}g · F {diary.totals.fatGrams}g
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Remaining</p>
                <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{diary.remaining.calories} kcal</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  P {diary.remaining.proteinGrams}g · C {diary.remaining.carbsGrams}g · F {diary.remaining.fatGrams}g
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Gemini insight</p>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                  {diary.insight?.summary || (totalEntries(diary) > 0 ? "No insight generated for this day yet." : "Log food to get a daily insight.")}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {diary.entriesByMeal.map((meal) => (
                <article
                  key={meal.slot}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{meal.label}</h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {meal.totals.calories} kcal · P {meal.totals.proteinGrams}g · C {meal.totals.carbsGrams}g · F {meal.totals.fatGrams}g
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPickerMealSlot(meal.slot);
                        setPickerTab("search");
                        setPickerQuantity("1");
                        setIsPickerOpen(true);
                      }}
                      className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Add food
                    </button>
                  </div>

                  {meal.entries.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No foods logged for this meal yet.</p>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {meal.entries.map((entry) => (
                        <li
                          key={entry.entryId}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-slate-100">{entry.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {entry.quantity} x {entry.servingLabel} · {entry.source.toUpperCase()}
                              </p>
                              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                {entry.calories} kcal · P {entry.proteinGrams}g · C {entry.carbsGrams}g · F {entry.fatGrams}g
                              </p>
                            </div>

                            <div className="flex flex-wrap items-end gap-2">
                              <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                                  Qty
                                </label>
                                <input
                                  type="number"
                                  min="0.25"
                                  step="0.25"
                                  value={entryDrafts[entry.entryId]?.quantity ?? entry.quantity.toString()}
                                  onChange={(event) =>
                                    setEntryDrafts((current) => ({
                                      ...current,
                                      [entry.entryId]: {
                                        quantity: event.target.value,
                                        mealSlot: current[entry.entryId]?.mealSlot ?? entry.mealSlot,
                                      },
                                    }))
                                  }
                                  className="w-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                                  Meal
                                </label>
                                <select
                                  value={entryDrafts[entry.entryId]?.mealSlot ?? entry.mealSlot}
                                  onChange={(event) =>
                                    setEntryDrafts((current) => ({
                                      ...current,
                                      [entry.entryId]: {
                                        quantity: current[entry.entryId]?.quantity ?? entry.quantity.toString(),
                                        mealSlot: event.target.value as MealSlot,
                                      },
                                    }))
                                  }
                                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                                >
                                  {mealSlots.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleSaveEntry(entry)}
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEntry(entry)}
                                className="rounded-md border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Suggested meal plan</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">Arc recommendations</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Keep this as your baseline, then log what you actually eat in the diary above.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {plan.meals.map((meal) => (
                <article
                  key={meal.slot}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        {meal.slot}
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{meal.label}</h3>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{meal.totals.calories} kcal</p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="rounded-full bg-white px-3 py-1 dark:bg-slate-800">P {meal.totals.proteinGrams}g</span>
                    <span className="rounded-full bg-white px-3 py-1 dark:bg-slate-800">C {meal.totals.carbsGrams}g</span>
                    <span className="rounded-full bg-white px-3 py-1 dark:bg-slate-800">F {meal.totals.fatGrams}g</span>
                  </div>

                  <ul className="mt-4 space-y-3">
                    {meal.foods.map((food) => (
                      <li
                        key={`${meal.slot}:${food.foodId}`}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{food.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {food.quantity} x {food.servingLabel} · {food.source.toUpperCase()}
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
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Custom foods</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">Your food library</h2>
              </div>
              <button
                type="button"
                onClick={openCreateCustomFoodModal}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Create food
              </button>
            </div>

            <div className="mt-4 flex gap-2">
              <input
                type="search"
                value={customFoodSearch}
                onChange={(event) => setCustomFoodSearch(event.target.value)}
                placeholder="Search custom foods"
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => void loadCustomFoods(customFoodSearch)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {customFoods.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No custom foods saved yet.</p>
              ) : (
                customFoods.map((food) => (
                  <div
                    key={food.foodId}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{food.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {food.servingLabel} · {food.calories} kcal
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          P {food.proteinGrams}g · C {food.carbsGrams}g · F {food.fatGrams}g
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditCustomFoodModal(food)}
                          className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomFood(food.foodId)}
                          className="rounded-md border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      {status ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          {status}
        </p>
      ) : null}

      {isPickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Add food</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {mealSlots.find((item) => item.value === pickerMealSlot)?.label}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setPickerTab("search")}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                  pickerTab === "search"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                Search foods
              </button>
              <button
                type="button"
                onClick={() => setPickerTab("custom")}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                  pickerTab === "custom"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                Your custom foods
              </button>
              <div className="ml-auto">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                  Quantity
                </label>
                <input
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={pickerQuantity}
                  onChange={(event) => setPickerQuantity(event.target.value)}
                  className="w-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

            {pickerTab === "search" ? (
              <div className="mt-5">
                <div className="flex gap-2">
                  <input
                    type="search"
                    value={foodSearch}
                    onChange={(event) => setFoodSearch(event.target.value)}
                    placeholder="Search USDA or local foods"
                    className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleFoodSearch}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    {isSearchingFoods ? "Searching..." : "Search"}
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {foodResults.map((food) => (
                    <button
                      key={`${food.source}:${food.foodId}`}
                      type="button"
                      onClick={() => handleAddFood(food)}
                      className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:border-slate-500 dark:hover:bg-slate-800"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{food.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {food.servingLabel} · {food.source.toUpperCase()}
                          </p>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{food.calories} kcal</p>
                      </div>
                    </button>
                  ))}

                  {!isSearchingFoods && foodResults.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Search for a food to add it to this meal.</p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {customFoods.map((food) => (
                  <button
                    key={food.foodId}
                    type="button"
                    onClick={() => handleAddFood(food)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:border-slate-500 dark:hover:bg-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{food.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{food.servingLabel}</p>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{food.calories} kcal</p>
                    </div>
                  </button>
                ))}

                {customFoods.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Create a custom food first to reuse it here.</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {isCustomFoodModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Custom food</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {editingCustomFoodId ? "Edit custom food" : "Create custom food"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomFoodModalOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Food name
                <input
                  type="text"
                  value={customFoodForm.name}
                  onChange={(event) => setCustomFoodForm((current) => ({ ...current, name: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Serving label
                <input
                  type="text"
                  value={customFoodForm.servingLabel}
                  onChange={(event) => setCustomFoodForm((current) => ({ ...current, servingLabel: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Category
                <select
                  value={customFoodForm.category}
                  onChange={(event) =>
                    setCustomFoodForm((current) => ({ ...current, category: event.target.value as FoodCategory }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                >
                  {foodCategories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Meal tags
                <div className="mt-2 flex flex-wrap gap-2">
                  {mealTagOptions.map((tag) => {
                    const checked = customFoodForm.mealTags.includes(tag.value);
                    return (
                      <label
                        key={tag.value}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                          checked
                            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900"
                            : "border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() =>
                            setCustomFoodForm((current) => ({
                              ...current,
                              mealTags: checked
                                ? current.mealTags.filter((item) => item !== tag.value)
                                : [...current.mealTags, tag.value],
                            }))
                          }
                        />
                        {tag.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Calories
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={customFoodForm.calories}
                  onChange={(event) => setCustomFoodForm((current) => ({ ...current, calories: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Protein (g)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={customFoodForm.proteinGrams}
                  onChange={(event) =>
                    setCustomFoodForm((current) => ({ ...current, proteinGrams: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Carbs (g)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={customFoodForm.carbsGrams}
                  onChange={(event) => setCustomFoodForm((current) => ({ ...current, carbsGrams: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Fat (g)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={customFoodForm.fatGrams}
                  onChange={(event) => setCustomFoodForm((current) => ({ ...current, fatGrams: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCustomFoodModalOpen(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCustomFood}
                disabled={isSavingCustomFood}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSavingCustomFood ? "Saving..." : editingCustomFoodId ? "Save changes" : "Create food"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
