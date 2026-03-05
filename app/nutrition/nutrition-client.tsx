"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { getAuthHeaders } from "@/lib/authenticated-fetch";
import {
  createMealSlotId,
  inferGoalLabel,
  MAX_MEAL_SLOTS,
  MIN_MEAL_SLOTS,
} from "@/lib/nutrition-tracking";
import type {
  CustomFood,
  FoodCategory,
  LoggedFoodEntry,
  MealSlot,
  MealSlotConfig,
  NutritionDashboardResponse,
  NutritionSearchResult,
  Recipe,
  RecipeIngredient,
  SavedMeal,
  SavedMealItem,
} from "@/types/nutrition";

type LibraryTab = "foods" | "recipes" | "meals" | "plan";
type PanelMode = "search" | "food" | "recipe" | "saveMeal" | "setup" | "mobilePlan" | null;

type FoodFormState = {
  id?: string;
  name: string;
  brandName: string;
  servingLabel: string;
  servingAmount: string;
  calories: string;
  proteinGrams: string;
  carbsGrams: string;
  fatGrams: string;
  category: FoodCategory;
};

type RecipeFormState = {
  id?: string;
  name: string;
  servings: string;
  ingredients: RecipeIngredient[];
};

type SavedMealFormState = {
  id?: string;
  name: string;
  slotSuggestionId?: string | null;
  slotSuggestionLabel?: string | null;
  items: SavedMealItem[];
};

const localDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const todayKey = localDateKey();

const numberInput = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMacro = (value: number) => `${Math.round(value)}g`;
const formatCalories = (value: number) => `${Math.round(value)} kcal`;
const formatPercent = (value: number) => `${Math.max(0, Math.min(100, Math.round(value)))}%`;

const progressValue = (consumed: number, target: number) => {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, (consumed / target) * 100));
};

const formatSlotCount = (count: number) => `${count} ${count === 1 ? "slot" : "slots"}`;

const totalEntriesCount = (meals: NutritionDashboardResponse["meals"]) =>
  meals.reduce((sum, meal) => sum + meal.entries.length, 0);

const responseMessage = async (response: Response, fallback: string) => {
  const data = (await response.json().catch(() => null)) as { message?: string } | null;
  return data?.message || fallback;
};

const emptyFoodForm = (): FoodFormState => ({
  name: "",
  brandName: "",
  servingLabel: "",
  servingAmount: "1",
  calories: "0",
  proteinGrams: "0",
  carbsGrams: "0",
  fatGrams: "0",
  category: "mixed",
});

const emptyRecipeForm = (): RecipeFormState => ({
  name: "",
  servings: "1",
  ingredients: [],
});

const emptySavedMealForm = (): SavedMealFormState => ({
  name: "",
  slotSuggestionId: null,
  slotSuggestionLabel: null,
  items: [],
});

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function NutritionOverlayCard({
  title,
  description,
  onClose,
  size = "wide",
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  size?: "narrow" | "wide";
  children: React.ReactNode;
}) {
  const titleId = useId();
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <div
        aria-hidden="true"
        onMouseDown={onClose}
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-lg"
      />
      <div className="relative flex min-h-screen items-center justify-center overflow-y-auto p-3 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onMouseDown={(event) => event.stopPropagation()}
          className={classNames(
            "relative z-[201] w-full overflow-hidden rounded-[2rem] border border-white/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.98))] shadow-[0_40px_120px_rgba(15,23,42,0.32)]",
            size === "narrow" ? "max-w-xl" : "max-w-2xl",
          )}
        >
          <div className="max-h-[82vh] overflow-y-auto p-5 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id={titleId} className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
                {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
              </div>
              <button
                autoFocus
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function NutritionClient() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<NutritionDashboardResponse | null>(null);
  const [customFoods, setCustomFoods] = useState<CustomFood[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("foods");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"all" | "foods" | "recipes" | "meals">("all");
  const [searchResults, setSearchResults] = useState<NutritionSearchResult[]>([]);
  const [isSearchingFoods, setIsSearchingFoods] = useState(false);
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const [foodForm, setFoodForm] = useState<FoodFormState>(emptyFoodForm);
  const [recipeForm, setRecipeForm] = useState<RecipeFormState>(emptyRecipeForm);
  const [recipeSearchQuery, setRecipeSearchQuery] = useState("");
  const [recipeSearchResults, setRecipeSearchResults] = useState<NutritionSearchResult[]>([]);
  const [savedMealForm, setSavedMealForm] = useState<SavedMealFormState>(emptySavedMealForm);
  const [mealSetupDraft, setMealSetupDraft] = useState<MealSlotConfig[]>([]);
  const [overlayTargetSlotId, setOverlayTargetSlotId] = useState<string | null>(null);
  const mealCardRefs = useRef<Record<string, HTMLElement | null>>({});

  const mealSetup = dashboard?.mealSetup ?? null;
  const activeSlot = mealSetup?.slots.find((slot) => slot.id === activeSlotId) ?? mealSetup?.slots[0] ?? null;
  const selectedSlotId = activeSlot?.id ?? null;
  const selectedSlotLabel = activeSlot?.label ?? "Meal";
  const overlaySlotId = overlayTargetSlotId ?? selectedSlotId ?? mealSetup?.slots[0]?.id ?? null;
  const overlaySlotLabel = mealSetup?.slots.find((slot) => slot.id === overlaySlotId)?.label ?? selectedSlotLabel;
  const selectedMeal = dashboard?.meals.find((meal) => meal.slotId === selectedSlotId) ?? dashboard?.meals[0] ?? null;
  const totalLoggedItems = dashboard ? totalEntriesCount(dashboard.meals) : 0;
  const recommendedFoodsCount = dashboard
    ? dashboard.planSuggestions.reduce((count, suggestion) => count + suggestion.foods.length, 0)
    : 0;
  const calorieProgress = dashboard ? progressValue(dashboard.totals.calories, dashboard.targets.calories) : 0;
  const proteinProgress = dashboard ? progressValue(dashboard.totals.proteinGrams, dashboard.targets.proteinGrams) : 0;
  const carbsProgress = dashboard ? progressValue(dashboard.totals.carbsGrams, dashboard.targets.carbsGrams) : 0;
  const fatProgress = dashboard ? progressValue(dashboard.totals.fatGrams, dashboard.targets.fatGrams) : 0;

  const closeOverlay = useCallback(() => {
    setPanelMode(null);
    setOverlayTargetSlotId(null);
  }, []);

  const setOverlaySlot = useCallback((slotId?: string | null) => {
    const resolvedSlotId = slotId ?? selectedSlotId ?? mealSetup?.slots[0]?.id ?? null;
    if (resolvedSlotId) {
      setActiveSlotId(resolvedSlotId);
      setOverlayTargetSlotId(resolvedSlotId);
    }
    return resolvedSlotId;
  }, [mealSetup, selectedSlotId]);

  const supportingItems = (() => {
    if (!dashboard) return [];
    if (libraryTab === "foods") {
      return customFoods.map((item) => ({
        id: item.id,
        title: item.name,
        subtitle: item.brandName ? `${item.brandName} • ${item.servingLabel}` : item.servingLabel,
        meta: `${Math.round(item.calories)} kcal`,
        onAdd: () =>
          void handleAddSearchResult({
            id: `custom-food-${item.id}`,
            itemType: "custom_food",
            sourceId: item.id,
            name: item.name,
            subtitle: "Custom food",
            servingLabel: item.servingLabel,
            calories: item.calories,
            proteinGrams: item.proteinGrams,
            carbsGrams: item.carbsGrams,
            fatGrams: item.fatGrams,
          }),
        onEdit: () => {
          setOverlayTargetSlotId(null);
          setFoodForm({
            id: item.id,
            name: item.name,
            brandName: item.brandName ?? "",
            servingLabel: item.servingLabel,
            servingAmount: String(item.servingAmount),
            calories: String(item.calories),
            proteinGrams: String(item.proteinGrams),
            carbsGrams: String(item.carbsGrams),
            fatGrams: String(item.fatGrams),
            category: item.category,
          });
          setPanelMode("food");
        },
      }));
    }
    if (libraryTab === "recipes") {
      return recipes.map((item) => ({
        id: item.id,
        title: item.name,
        subtitle: `${item.ingredients.length} ingredients • ${item.servings} servings`,
        meta: `${Math.round(item.perServing.calories)} kcal per serving`,
        onAdd: () =>
          void handleAddSearchResult({
            id: `recipe-${item.id}`,
            itemType: "recipe",
            sourceId: item.id,
            name: item.name,
            subtitle: "Recipe",
            servingLabel: "1 serving",
            calories: item.perServing.calories,
            proteinGrams: item.perServing.proteinGrams,
            carbsGrams: item.perServing.carbsGrams,
            fatGrams: item.perServing.fatGrams,
          }),
        onEdit: () => {
          setOverlayTargetSlotId(null);
          setRecipeForm({
            id: item.id,
            name: item.name,
            servings: String(item.servings),
            ingredients: item.ingredients,
          });
          setPanelMode("recipe");
        },
      }));
    }
    if (libraryTab === "meals") {
      return savedMeals.map((item) => ({
        id: item.id,
        title: item.name,
        subtitle: `${item.items.length} items`,
        meta: `${Math.round(item.totals.calories)} kcal`,
        onAdd: () =>
          void handleAddSearchResult({
            id: `saved-meal-${item.id}`,
            itemType: "saved_meal",
            sourceId: item.id,
            name: item.name,
            subtitle: "Saved meal",
            servingLabel: "1 saved meal",
            calories: item.totals.calories,
            proteinGrams: item.totals.proteinGrams,
            carbsGrams: item.totals.carbsGrams,
            fatGrams: item.totals.fatGrams,
          }),
        onEdit: () => {
          setOverlayTargetSlotId(null);
          setSavedMealForm({
            id: item.id,
            name: item.name,
            slotSuggestionId: item.slotSuggestionId,
            slotSuggestionLabel: item.slotSuggestionLabel,
            items: item.items,
          });
          setPanelMode("saveMeal");
        },
      }));
    }
    return dashboard.planSuggestions.flatMap((suggestion) =>
      suggestion.foods.map((food) => ({
        id: food.id,
        title: food.name,
        subtitle: suggestion.label,
        meta: `${Math.round(food.calories)} kcal`,
        onAdd: () => void handleAddSearchResult(food, true),
        onEdit: undefined,
      })),
    );
  })();

  const quickItems = useMemo(() => {
    if (!dashboard) return [];
    if (!searchQuery.trim()) {
      return [...dashboard.recentItems, ...dashboard.frequentItems].slice(0, 12);
    }
    return searchResults;
  }, [dashboard, searchQuery, searchResults]);

  const fetchLibraries = useCallback(async (headers: HeadersInit) => {
    const [foodsResponse, recipesResponse, mealsResponse] = await Promise.all([
      fetch("/api/v1/nutrition/custom-foods", { headers, cache: "no-store" }),
      fetch("/api/v1/nutrition/recipes", { headers, cache: "no-store" }),
      fetch("/api/v1/nutrition/saved-meals", { headers, cache: "no-store" }),
    ]);

    if (!foodsResponse.ok) throw new Error(await responseMessage(foodsResponse, "Unable to load custom foods."));
    if (!recipesResponse.ok) throw new Error(await responseMessage(recipesResponse, "Unable to load recipes."));
    if (!mealsResponse.ok) throw new Error(await responseMessage(mealsResponse, "Unable to load saved meals."));

    const [foodsData, recipesData, mealsData] = await Promise.all([
      foodsResponse.json(),
      recipesResponse.json(),
      mealsResponse.json(),
    ]);

    setCustomFoods(foodsData.items ?? []);
    setRecipes(recipesData.items ?? []);
    setSavedMeals(mealsData.items ?? []);
  }, []);

  const fetchDashboard = useCallback(async (headers: HeadersInit) => {
    const response = await fetch(`/api/v1/nutrition/dashboard?date=${todayKey}`, {
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
      throw new Error(errorData?.message || "Unable to load nutrition workspace.");
    }

    const data = (await response.json()) as NutritionDashboardResponse;
    setDashboard(data);
    setMealSetupDraft(data.mealSetup.slots);
    setActiveSlotId((current) => current ?? data.mealSetup.slots[0]?.id ?? null);
  }, [router]);

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
          await Promise.all([fetchDashboard(headers), fetchLibraries(headers)]);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Unable to load nutrition workspace.");
        } finally {
          setIsLoading(false);
        }
      })();
    });
    return unsubscribe;
  }, [fetchDashboard, fetchLibraries, router]);

  useEffect(() => {
    if (panelMode !== "search") return;
    if (!searchQuery.trim()) {
      setIsSearchingFoods(false);
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    setIsSearchingFoods(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const headers = await getAuthHeaders();
          const response = await fetch(
            `/api/v1/nutrition/search?query=${encodeURIComponent(searchQuery)}&scope=${searchScope}`,
            { headers, cache: "no-store" },
          );
          const data = (await response.json()) as { items?: NutritionSearchResult[]; message?: string };
          if (!response.ok) throw new Error(data.message || "Unable to search foods.");
          if (!cancelled) setSearchResults(data.items ?? []);
        } catch (error) {
          if (!cancelled) setStatus(error instanceof Error ? error.message : "Unable to search.");
        } finally {
          if (!cancelled) setIsSearchingFoods(false);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [panelMode, searchQuery, searchScope]);

  useEffect(() => {
    if (panelMode !== "recipe") return;
    if (!recipeSearchQuery.trim()) {
      setRecipeSearchResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const headers = await getAuthHeaders();
          const response = await fetch(
            `/api/v1/nutrition/search?query=${encodeURIComponent(recipeSearchQuery)}&scope=all`,
            { headers, cache: "no-store" },
          );
          const data = (await response.json()) as { items?: NutritionSearchResult[]; message?: string };
          if (!response.ok) throw new Error(data.message || "Unable to search ingredients.");
          if (!cancelled) {
            setRecipeSearchResults((data.items ?? []).filter((item) => item.itemType !== "planned_food"));
          }
        } catch (error) {
          if (!cancelled) setStatus(error instanceof Error ? error.message : "Unable to search ingredients.");
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [panelMode, recipeSearchQuery]);

  useEffect(() => {
    if (!panelMode) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeOverlay();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeOverlay, panelMode]);

  const refreshAll = useCallback(async (message?: string) => {
    const headers = await getAuthHeaders();
    await Promise.all([fetchDashboard(headers), fetchLibraries(headers)]);
    if (message) setStatus(message);
  }, [fetchDashboard, fetchLibraries]);

  const focusMealSlot = useCallback((slotId: string) => {
    setActiveSlotId(slotId);
    window.requestAnimationFrame(() => {
      mealCardRefs.current[slotId]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const openFoodCreator = useCallback((slotId?: string | null) => {
    setOverlaySlot(slotId);
    setFoodForm(emptyFoodForm());
    setPanelMode("food");
  }, [setOverlaySlot]);

  const openRecipeCreator = useCallback((slotId?: string | null) => {
    setOverlaySlot(slotId);
    setRecipeForm(emptyRecipeForm());
    setRecipeSearchQuery("");
    setRecipeSearchResults([]);
    setPanelMode("recipe");
  }, [setOverlaySlot]);

  const resolvePlanSlotTargetId = useCallback((planSlot: MealSlot): string | null => {
    if (!mealSetup?.slots.length) return null;
    const slots = mealSetup.slots;
    const byLabel = (keywords: string[]) =>
      slots.find((slot) => keywords.some((keyword) => slot.label.toLowerCase().includes(keyword)))?.id ?? null;

    if (planSlot === "breakfast") {
      return byLabel(["breakfast", "morning"]) ?? slots[0]?.id ?? null;
    }
    if (planSlot === "lunch") {
      const middleIndex = Math.floor((slots.length - 1) / 2);
      return byLabel(["lunch", "midday", "noon"]) ?? slots[middleIndex]?.id ?? slots[0]?.id ?? null;
    }
    if (planSlot === "dinner") {
      return byLabel(["dinner", "evening", "supper"]) ?? slots[slots.length - 1]?.id ?? null;
    }
    if (planSlot === "snack1") {
      return byLabel(["snack", "pre", "post"]) ?? slots[Math.min(3, slots.length - 1)]?.id ?? slots[slots.length - 1]?.id ?? null;
    }
    return byLabel(["snack", "pre", "post"]) ?? slots[Math.min(4, slots.length - 1)]?.id ?? slots[slots.length - 1]?.id ?? null;
  }, [mealSetup]);

  const handleAddSearchResult = useCallback(async (
    item: NutritionSearchResult,
    createdFromPlan = false,
    targetSlotId?: string | null,
  ) => {
    if (!mealSetup || !dashboard) return;
    const resolvedSlotId = targetSlotId ?? selectedSlotId ?? mealSetup.slots[0]?.id ?? null;
    if (!resolvedSlotId) return;
    const resolvedSlotLabel = mealSetup.slots.find((slot) => slot.id === resolvedSlotId)?.label ?? selectedSlotLabel;
    setAddingItemId(item.id);
    setIsBusy(true);
    setStatus(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/v1/nutrition/logs/${dashboard.date}/entries`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          mealSlotId: resolvedSlotId,
          mealSlotLabel: resolvedSlotLabel,
          entryType: item.itemType,
          sourceId: item.sourceId,
          name: item.name,
          servingLabel: item.servingLabel,
          calories: item.calories,
          proteinGrams: item.proteinGrams,
          carbsGrams: item.carbsGrams,
          fatGrams: item.fatGrams,
          quantity: 1,
          createdFromPlan,
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "Unable to add item."));
      setActiveSlotId(resolvedSlotId);
      await refreshAll(`${item.name} added to ${resolvedSlotLabel}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to add item.");
    } finally {
      setAddingItemId(null);
      setIsBusy(false);
    }
  }, [dashboard, mealSetup, refreshAll, selectedSlotId, selectedSlotLabel]);

  const openSearch = useCallback((slotId?: string) => {
    setOverlaySlot(slotId);
    setSearchQuery("");
    setSearchResults([]);
    setIsSearchingFoods(false);
    setPanelMode("search");
  }, [setOverlaySlot]);

  const addAllPlanSuggestions = useCallback(async () => {
    if (!dashboard || !mealSetup) return;
    const recommendations = dashboard.planSuggestions.flatMap((suggestion) =>
      suggestion.foods.map((food) => ({ suggestion, food })),
    );
    if (recommendations.length === 0) {
      setStatus("No recommended foods to add right now.");
      return;
    }

    setAddingItemId("bulk-plan");
    setIsBusy(true);
    setStatus(null);
    try {
      const headers = await getAuthHeaders();
      let added = 0;
      let failed = 0;

      for (const { suggestion, food } of recommendations) {
        const targetSlotId = resolvePlanSlotTargetId(suggestion.slot);
        if (!targetSlotId) {
          failed += 1;
          continue;
        }
        const targetSlotLabel = mealSetup.slots.find((slot) => slot.id === targetSlotId)?.label ?? "Meal";
        const response = await fetch(`/api/v1/nutrition/logs/${dashboard.date}/entries`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            mealSlotId: targetSlotId,
            mealSlotLabel: targetSlotLabel,
            entryType: food.itemType,
            sourceId: food.sourceId,
            name: food.name,
            servingLabel: food.servingLabel,
            calories: food.calories,
            proteinGrams: food.proteinGrams,
            carbsGrams: food.carbsGrams,
            fatGrams: food.fatGrams,
            quantity: 1,
            createdFromPlan: true,
          }),
        });
        if (response.ok) {
          added += 1;
        } else {
          failed += 1;
        }
      }

      await refreshAll(
        failed > 0
          ? `${added} recommended foods added, ${failed} could not be added.`
          : `${added} recommended foods added to today.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to add recommended foods.");
    } finally {
      setAddingItemId(null);
      setIsBusy(false);
    }
  }, [dashboard, mealSetup, refreshAll, resolvePlanSlotTargetId]);

  const refreshPlanSuggestions = useCallback(async () => {
    setIsBusy(true);
    setStatus(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/v1/nutrition/plan/regenerate", {
        method: "POST",
        headers,
      });
      if (!response.ok) throw new Error(await responseMessage(response, "Unable to refresh meal plan."));
      await refreshAll("Meal plan refreshed from your latest nutrition setup.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to refresh meal plan.");
    } finally {
      setIsBusy(false);
    }
  }, [refreshAll]);

  const handleEntryUpdate = async (entry: LoggedFoodEntry, updates: { quantity?: number; mealSlotId?: string }) => {
    if (!dashboard) return;
    setIsBusy(true);
    setStatus(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/v1/nutrition/logs/${dashboard.date}/entries/${entry.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          quantity: updates.quantity,
          mealSlotId: updates.mealSlotId,
          mealSlotLabel: mealSetup?.slots.find((slot) => slot.id === updates.mealSlotId)?.label,
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message || "Unable to update entry.");
      await refreshAll("Meal entry updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to update entry.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!dashboard) return;
    setIsBusy(true);
    setStatus(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/v1/nutrition/logs/${dashboard.date}/entries/${entryId}`, {
        method: "DELETE",
        headers,
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message || "Unable to delete entry.");
      await refreshAll("Meal entry removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to delete entry.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleClearMealSlot = async (meal: NutritionDashboardResponse["meals"][number]) => {
    if (!dashboard || meal.entries.length === 0) return;

    const shouldClear = window.confirm(
      `Clear all ${meal.entries.length} item${meal.entries.length === 1 ? "" : "s"} from ${meal.slotLabel}?`,
    );
    if (!shouldClear) return;

    setIsBusy(true);
    setStatus(null);
    try {
      const headers = await getAuthHeaders();
      const deletions = await Promise.all(
        meal.entries.map(async (entry) => {
          const response = await fetch(`/api/v1/nutrition/logs/${dashboard.date}/entries/${entry.id}`, {
            method: "DELETE",
            headers,
          });
          if (!response.ok) {
            const data = (await response.json().catch(() => null)) as { message?: string } | null;
            return data?.message || "Unable to delete one or more entries.";
          }
          return null;
        }),
      );

      const failed = deletions.filter(Boolean).length;
      if (failed > 0) {
        await refreshAll(
          `${meal.entries.length - failed} item${meal.entries.length - failed === 1 ? "" : "s"} cleared from ${meal.slotLabel}, ${failed} failed.`,
        );
      } else {
        await refreshAll(`${meal.slotLabel} cleared.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to clear meal slot.");
    } finally {
      setIsBusy(false);
    }
  };

  const submitFoodForm = async () => {
    setIsBusy(true);
    setStatus(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        foodForm.id ? `/api/v1/nutrition/custom-foods/${foodForm.id}` : "/api/v1/nutrition/custom-foods",
        {
          method: foodForm.id ? "PATCH" : "POST",
          headers,
          body: JSON.stringify({
            name: foodForm.name,
            brandName: foodForm.brandName,
            servingLabel: foodForm.servingLabel,
            servingAmount: numberInput(foodForm.servingAmount),
            calories: numberInput(foodForm.calories),
            proteinGrams: numberInput(foodForm.proteinGrams),
            carbsGrams: numberInput(foodForm.carbsGrams),
            fatGrams: numberInput(foodForm.fatGrams),
            category: foodForm.category,
          }),
        },
      );
      const data = (await response.json()) as { message?: string; item?: CustomFood };
      if (!response.ok) throw new Error(data.message || "Unable to save custom food.");

      const createdOrUpdatedFood = data.item ?? null;
      const targetSlotId = overlayTargetSlotId ?? selectedSlotId;

      if (!foodForm.id && createdOrUpdatedFood && targetSlotId) {
        await handleAddSearchResult(
          {
            id: `custom-food-${createdOrUpdatedFood.id}`,
            itemType: "custom_food",
            sourceId: createdOrUpdatedFood.id,
            name: createdOrUpdatedFood.name,
            subtitle: createdOrUpdatedFood.brandName ? `Custom food • ${createdOrUpdatedFood.brandName}` : "Custom food",
            servingLabel: createdOrUpdatedFood.servingLabel,
            calories: createdOrUpdatedFood.calories,
            proteinGrams: createdOrUpdatedFood.proteinGrams,
            carbsGrams: createdOrUpdatedFood.carbsGrams,
            fatGrams: createdOrUpdatedFood.fatGrams,
          },
          false,
          targetSlotId,
        );
      }

      setPanelMode(null);
      setFoodForm(emptyFoodForm());
      setOverlayTargetSlotId(null);
      await refreshAll(foodForm.id ? "Custom food updated." : "Custom food created and logged.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save custom food.");
    } finally {
      setIsBusy(false);
    }
  };

  const submitRecipeForm = async () => {
    setIsBusy(true);
    setStatus(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        recipeForm.id ? `/api/v1/nutrition/recipes/${recipeForm.id}` : "/api/v1/nutrition/recipes",
        {
          method: recipeForm.id ? "PATCH" : "POST",
          headers,
          body: JSON.stringify({
            name: recipeForm.name,
            servings: numberInput(recipeForm.servings),
            ingredients: recipeForm.ingredients,
          }),
        },
      );
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message || "Unable to save recipe.");
      setPanelMode(null);
      setOverlayTargetSlotId(null);
      setRecipeForm(emptyRecipeForm());
      setRecipeSearchQuery("");
      setRecipeSearchResults([]);
      await refreshAll(recipeForm.id ? "Recipe updated." : "Recipe created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save recipe.");
    } finally {
      setIsBusy(false);
    }
  };

  const submitSavedMealForm = async () => {
    setIsBusy(true);
    setStatus(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        savedMealForm.id ? `/api/v1/nutrition/saved-meals/${savedMealForm.id}` : "/api/v1/nutrition/saved-meals",
        {
          method: savedMealForm.id ? "PATCH" : "POST",
          headers,
          body: JSON.stringify({
            name: savedMealForm.name,
            slotSuggestionId: savedMealForm.slotSuggestionId,
            slotSuggestionLabel: savedMealForm.slotSuggestionLabel,
            items: savedMealForm.items,
          }),
        },
      );
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message || "Unable to save meal.");
      setPanelMode(null);
      setOverlayTargetSlotId(null);
      setSavedMealForm(emptySavedMealForm());
      await refreshAll(savedMealForm.id ? "Saved meal updated." : "Saved meal created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save meal.");
    } finally {
      setIsBusy(false);
    }
  };

  const submitMealSetup = async () => {
    if (!dashboard) return;
    setIsBusy(true);
    setStatus(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/v1/nutrition/meal-setup?date=${dashboard.date}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ slots: mealSetupDraft }),
      });
      const data = (await response.json()) as { message?: string; regeneratedPlan?: boolean };
      if (!response.ok) throw new Error(data.message || "Unable to save meal setup.");
      setPanelMode(null);
      await refreshAll(data.message || "Meal setup and plan updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save meal setup.");
    } finally {
      setIsBusy(false);
    }
  };

  const openSaveMealFromSlot = (slotId: string) => {
    const slot = dashboard?.meals.find((item) => item.slotId === slotId);
    if (!slot) return;
    setOverlaySlot(slotId);
    setSavedMealForm({
      name: slot.slotLabel,
      slotSuggestionId: slot.slotId,
      slotSuggestionLabel: slot.slotLabel,
      items: slot.entries.map((entry) => ({
        itemType: entry.entryType === "planned_food" ? "usda" : entry.entryType,
        sourceId: entry.sourceId,
        name: entry.name,
        servingLabel: entry.servingLabel,
        quantity: entry.quantity,
        calories: entry.calories,
        proteinGrams: entry.proteinGrams,
        carbsGrams: entry.carbsGrams,
        fatGrams: entry.fatGrams,
      })),
    });
    setPanelMode("saveMeal");
  };

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 text-sm text-slate-600 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
          Loading nutrition workspace...
        </div>
      </section>
    );
  }

  if (!dashboard || !mealSetup) {
    return (
      <section className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Nutrition</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Nutrition workspace unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">{status || "Arc could not load your nutrition data."}</p>
          <div className="mt-5 flex gap-3">
            <Link href="/onboarding" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              Go to onboarding
            </Link>
            <Link href="/nutrition/setup" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
              Open nutrition setup
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-scene mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="rounded-[2.25rem] border border-white/60 bg-[linear-gradient(140deg,rgba(255,255,255,0.95),rgba(241,245,249,0.92))] p-5 shadow-[0_30px_80px_rgba(15,23,42,0.12)] sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-700">Nutrition Workspace</p>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-5xl">
              Daily logging built around your own meal structure.
            </h1>
            <p className="mt-3 hidden max-w-2xl text-sm leading-6 text-slate-600 sm:block sm:text-base">
              Track meals, recipes, and macros in one place. Arc keeps the plan in view, but your day stays in your control.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-600 sm:mt-5 sm:flex sm:flex-wrap sm:gap-3">
              <span className="min-w-0 rounded-2xl bg-white px-3 py-2 shadow-sm sm:rounded-full sm:px-4">
                Goal: <span className="font-semibold text-slate-900">{inferGoalLabel(dashboard.plan?.nutritionGoal ?? null)}</span>
              </span>
              <span className="min-w-0 rounded-2xl bg-white px-3 py-2 shadow-sm sm:rounded-full sm:px-4">
                Date: <span className="font-semibold text-slate-900">{dashboard.date === todayKey ? "Today" : dashboard.date}</span>
              </span>
              <span className="min-w-0 rounded-2xl bg-white px-3 py-2 shadow-sm sm:rounded-full sm:px-4">
                Meal setup: <span className="font-semibold text-slate-900">{formatSlotCount(mealSetup.slots.length)}</span>
              </span>
              <span className="min-w-0 rounded-2xl bg-white px-3 py-2 shadow-sm sm:rounded-full sm:px-4">
                Logged today: <span className="font-semibold text-slate-900">{totalLoggedItems} items</span>
              </span>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:w-[360px]">
            <button
              type="button"
              onClick={() => openSearch(selectedSlotId ?? mealSetup.slots[0]?.id)}
              className="rounded-[1.5rem] border border-sky-200 bg-sky-50 px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-sky-100"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Quick Add</p>
              <p className="mt-1 text-base font-bold text-slate-900 sm:text-lg">Add to {selectedSlotLabel}</p>
            </button>
            <button
              type="button"
              onClick={() => {
                openRecipeCreator(selectedSlotId ?? mealSetup.slots[0]?.id);
              }}
              className="rounded-[1.5rem] border border-orange-200 bg-orange-50 px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-orange-100"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Build</p>
              <p className="mt-1 text-base font-bold text-slate-900 sm:text-lg">Create Recipe</p>
            </button>
            <button
              type="button"
              onClick={() => {
                openFoodCreator(selectedSlotId ?? mealSetup.slots[0]?.id);
              }}
              className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Library</p>
              <p className="mt-1 text-base font-bold text-slate-900 sm:text-lg">Create Food</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setMealSetupDraft(mealSetup.slots);
                setPanelMode("setup");
              }}
              className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Layout</p>
              <p className="mt-1 text-base font-bold text-slate-900 sm:text-lg">Edit Meal Setup</p>
            </button>
            <button
              type="button"
              onClick={() => setPanelMode("mobilePlan")}
              className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-100 sm:hidden"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Gemini</p>
              <p className="mt-1 text-base font-bold text-slate-900">View Generated Plan</p>
            </button>
          </div>
        </div>

        <div className="mt-8 hidden gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] md:grid">
          <div className="rounded-[1.8rem] border border-slate-200 bg-white/85 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Today&apos;s Flow</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Jump between meal slots fast</h2>
              </div>
              <button
                type="button"
                onClick={() => openSearch(selectedSlotId ?? mealSetup.slots[0]?.id)}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Add to {selectedSlotLabel}
              </button>
            </div>
            <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-1">
              {dashboard.meals.map((meal, index) => (
                <button
                  key={meal.slotId}
                  type="button"
                  onClick={() => focusMealSlot(meal.slotId)}
                  className={classNames(
                    "min-w-[190px] snap-start rounded-[1.4rem] border px-4 py-3 text-left transition",
                    selectedSlotId === meal.slotId
                      ? "border-sky-300 bg-sky-50 shadow-sm"
                      : "border-slate-200 bg-slate-50 hover:bg-white",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Slot {index + 1}</p>
                      <p className="mt-1 text-base font-bold text-slate-900">{meal.slotLabel}</p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {meal.entries.length}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#0ea5e9,#f97316)]"
                      style={{ width: `${progressValue(meal.totals.calories, dashboard.targets.calories)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{formatCalories(meal.totals.calories)}</p>
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Active slot: <span className="font-semibold text-slate-900">{selectedSlotLabel}</span>
            </p>
          </div>

          <div className="rounded-[1.8rem] border border-slate-200 bg-[linear-gradient(135deg,rgba(14,165,233,0.08),rgba(249,115,22,0.08),rgba(255,255,255,0.92))] p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Focused Slot</p>
            <div className="mt-2 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-900">{selectedMeal?.slotLabel ?? selectedSlotLabel}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedMeal?.entries.length ?? 0} logged items, {formatCalories(selectedMeal?.totals.calories ?? 0)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openSearch(selectedSlotId ?? mealSetup.slots[0]?.id)}
                className="rounded-full border border-white/70 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-white"
              >
                Search
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-white/90 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Protein</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{Math.round(selectedMeal?.totals.proteinGrams ?? 0)}g</p>
              </div>
              <div className="rounded-2xl bg-white/90 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Carbs</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{Math.round(selectedMeal?.totals.carbsGrams ?? 0)}g</p>
              </div>
              <div className="rounded-2xl bg-white/90 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Fat</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{Math.round(selectedMeal?.totals.fatGrams ?? 0)}g</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:mt-8 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
          {[
            { label: "Calories", consumed: dashboard.totals.calories, remaining: dashboard.remaining.calories, target: dashboard.targets.calories, progress: calorieProgress },
            { label: "Protein", consumed: dashboard.totals.proteinGrams, remaining: dashboard.remaining.proteinGrams, target: dashboard.targets.proteinGrams, progress: proteinProgress },
            { label: "Carbs", consumed: dashboard.totals.carbsGrams, remaining: dashboard.remaining.carbsGrams, target: dashboard.targets.carbsGrams, progress: carbsProgress },
            { label: "Fat", consumed: dashboard.totals.fatGrams, remaining: dashboard.remaining.fatGrams, target: dashboard.targets.fatGrams, progress: fatProgress },
          ].map((metric, index) => (
            <article
              key={metric.label}
              className={classNames(
                "page-card rounded-[1.4rem] border p-4 shadow-sm sm:rounded-[1.75rem] sm:p-5",
                index === 0
                  ? "border-orange-200 bg-[linear-gradient(180deg,#fff7ed,#ffffff)]"
                  : "border-slate-200 bg-white/90",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{metric.label}</p>
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  {formatPercent(metric.progress)}
                </span>
              </div>
              <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:mt-3 sm:text-4xl">{Math.round(metric.consumed)}</p>
              <p className="mt-1 text-sm text-slate-500">
                Target {Math.round(metric.target)}{metric.label === "Calories" ? "" : "g"}
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={classNames(
                    "h-full rounded-full",
                    index === 0 ? "bg-gradient-to-r from-orange-400 to-sky-500" : "bg-slate-900",
                  )}
                  style={{ width: `${metric.progress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500 sm:text-sm">
                {metric.label === "Calories" ? `${Math.round(metric.remaining)} remaining` : `${Math.round(metric.remaining)}g remaining`}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.95fr)]">
          <div className="space-y-4">
            {dashboard.meals.map((meal) => (
              <article
                key={meal.slotId}
                ref={(element) => {
                  mealCardRefs.current[meal.slotId] = element;
                }}
                className={classNames(
                  "rounded-[1.9rem] border bg-white/90 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] transition",
                  selectedSlotId === meal.slotId
                    ? "border-sky-200 ring-1 ring-sky-100"
                    : "border-slate-200/80",
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Meal Slot</p>
                    <button
                      type="button"
                      onClick={() => focusMealSlot(meal.slotId)}
                      className="mt-2 text-left text-2xl font-bold tracking-tight text-slate-900"
                    >
                      {meal.slotLabel}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {formatCalories(meal.totals.calories)}
                    </span>
                    <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                      P {formatMacro(meal.totals.proteinGrams)}
                    </span>
                    <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                      C {formatMacro(meal.totals.carbsGrams)}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      F {formatMacro(meal.totals.fatGrams)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:gap-3">
                  <button
                    type="button"
                    onClick={() => openSearch(meal.slotId)}
                    className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
                  >
                    Add item
                  </button>
                  <button
                    type="button"
                    onClick={() => openSaveMealFromSlot(meal.slotId)}
                    disabled={meal.entries.length === 0}
                    className="w-full rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    Save as meal
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleClearMealSlot(meal)}
                    disabled={meal.entries.length === 0 || isBusy}
                    className="w-full rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    Clear slot
                  </button>
                </div>

                {meal.entries.length === 0 ? (
                  <div className="mt-5 rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50/80 p-5">
                    <p className="text-sm font-semibold text-slate-700">No items logged yet.</p>
                    <p className="mt-1 text-sm text-slate-500">Add food, a recipe, or one of your saved meals to start tracking this slot.</p>
                    <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:gap-3">
                      <button
                        type="button"
                        onClick={() => openSearch(meal.slotId)}
                        className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
                      >
                        Search foods
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSlotId(meal.slotId);
                          openFoodCreator(meal.slotId);
                        }}
                        className="w-full rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white sm:w-auto"
                      >
                        Create food
                      </button>
                    </div>
                  </div>
                ) : (
                  <ul className="mt-5 space-y-3">
                    {meal.entries.map((entry) => (
                      <li key={entry.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-bold text-slate-900">{entry.name}</p>
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                {entry.entryType.replace("_", " ")}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-slate-500">
                              {entry.quantity} x {entry.servingLabel}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                              <span className="rounded-full bg-white px-2.5 py-1">{formatCalories(entry.calories)}</span>
                              <span className="rounded-full bg-white px-2.5 py-1">P {formatMacro(entry.proteinGrams)}</span>
                              <span className="rounded-full bg-white px-2.5 py-1">C {formatMacro(entry.carbsGrams)}</span>
                              <span className="rounded-full bg-white px-2.5 py-1">F {formatMacro(entry.fatGrams)}</span>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-[90px_1fr_auto]">
                            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Qty
                              <input
                                type="number"
                                step="0.25"
                                min="0.25"
                                defaultValue={entry.quantity}
                                onBlur={(event) => {
                                  const next = Number.parseFloat(event.currentTarget.value);
                                  if (Number.isFinite(next) && next > 0 && next !== entry.quantity) {
                                    void handleEntryUpdate(entry, { quantity: next });
                                  }
                                }}
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Move
                              <select
                                value={entry.mealSlotId}
                                onChange={(event) => void handleEntryUpdate(entry, { mealSlotId: event.currentTarget.value })}
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                              >
                                {mealSetup.slots.map((slot) => (
                                  <option key={slot.id} value={slot.id}>
                                    {slot.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              onClick={() => void handleDeleteEntry(entry.id)}
                              className="col-span-2 w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 md:col-span-1 md:self-end md:w-auto"
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

          <aside className="hidden space-y-4 lg:block xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-[1.9rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "foods", label: `My Foods (${dashboard.myFoodsCount})` },
                  { id: "recipes", label: `My Recipes (${dashboard.myRecipesCount})` },
                  { id: "meals", label: `My Meals (${dashboard.myMealsCount})` },
                  { id: "plan", label: "Suggested from Plan" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setLibraryTab(tab.id as LibraryTab)}
                    className={classNames(
                      "rounded-full px-4 py-2 text-sm font-semibold transition",
                      libraryTab === tab.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="mt-4 space-y-3">
                {supportingItems.length === 0 ? (
                  <div className="rounded-[1.4rem] border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                    Nothing here yet. Build a food, recipe, or saved meal to populate this library.
                  </div>
                ) : (
                  supportingItems.slice(0, 8).map((item) => (
                    <div key={item.id} className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-1 text-sm text-slate-500">{item.subtitle}</p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{item.meta}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={item.onAdd}
                            className="rounded-full bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-700"
                          >
                            Add
                          </button>
                          {item.onEdit ? (
                            <button
                              type="button"
                              onClick={item.onEdit}
                              className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white"
                            >
                              Edit
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[1.9rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Plan Context</p>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">Generated targets stay visible</h3>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={!dashboard.plan || isBusy}
                    onClick={() => void refreshPlanSuggestions()}
                    className="rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isBusy ? "Refreshing..." : "Refresh plan"}
                  </button>
                  <button
                    type="button"
                    disabled={!dashboard.plan || recommendedFoodsCount === 0 || isBusy}
                    onClick={() => void addAllPlanSuggestions()}
                    className="rounded-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {addingItemId === "bulk-plan"
                      ? "Adding recommendations..."
                      : `Add all recommendations (${recommendedFoodsCount})`}
                  </button>
                  <Link href="/nutrition/setup" className="rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                    Edit inputs
                  </Link>
                </div>
              </div>
              {dashboard.plan ? (
                <div className="mt-4 space-y-3">
                  {dashboard.planSuggestions.slice(0, 3).map((suggestion) => (
                    <div key={suggestion.slot} className="rounded-[1.3rem] border border-orange-200 bg-orange-50/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">{suggestion.label}</p>
                      <div className="mt-2 space-y-2">
                        {suggestion.foods.map((food) => (
                          <button
                            key={food.id}
                            type="button"
                            onClick={() => void handleAddSearchResult(food, true, selectedSlotId ?? mealSetup.slots[0]?.id)}
                            className="flex w-full items-center justify-between rounded-2xl bg-white px-3 py-3 text-left transition hover:bg-orange-100"
                          >
                            <div>
                              <p className="font-semibold text-slate-900">{food.name}</p>
                              <p className="text-sm text-slate-500">{food.servingLabel}</p>
                            </div>
                            <span className="text-sm font-semibold text-slate-700">{formatCalories(food.calories)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">No active plan yet. Complete onboarding to unlock target-based suggestions.</p>
              )}
            </div>

            <div className="rounded-[1.9rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recent Helpers</p>
              <div className="mt-4 space-y-3">
                {[...dashboard.recentItems, ...dashboard.frequentItems].slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void handleAddSearchResult(item, false, selectedSlotId)}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:bg-slate-100"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="text-sm text-slate-500">{item.subtitle}</p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Add</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {status ? (
          <p className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
            {status}
          </p>
        ) : null}
      </div>

      {isBusy ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 mx-auto flex w-fit items-center gap-3 rounded-full border border-slate-200 bg-white/95 px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_20px_40px_rgba(15,23,42,0.16)]">
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-sky-500" />
          Updating nutrition workspace...
        </div>
      ) : null}

      {panelMode === "search" ? (
        <NutritionOverlayCard
          title={`Add to ${overlaySlotLabel}`}
          description="Search Arc’s database, your saved foods, your recipes, or reusable meals."
          onClose={closeOverlay}
          size="wide"
        >
          <div className="space-y-5">
            <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/90 p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.currentTarget.value)}
                  placeholder="Search foods, recipes, or saved meals"
                  className="w-full rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-0 transition focus:border-sky-300"
                />
                <select
                  value={overlaySlotId ?? ""}
                  onChange={(event) => {
                    setOverlayTargetSlotId(event.currentTarget.value);
                    setActiveSlotId(event.currentTarget.value);
                  }}
                  className="w-full rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900"
                >
                  {mealSetup.slots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { id: "all", label: "All" },
                  { id: "foods", label: "Foods" },
                  { id: "recipes", label: "Recipes" },
                  { id: "meals", label: "Meals" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSearchScope(option.id as typeof searchScope)}
                    className={classNames(
                      "rounded-full px-3 py-2 text-sm font-semibold transition",
                      searchScope === option.id ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  openFoodCreator(overlaySlotId);
                }}
                className="rounded-[1.3rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Can&apos;t find it?</p>
                <p className="mt-1 text-base font-bold text-slate-900">Create a food</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  openRecipeCreator(overlaySlotId);
                }}
                className="rounded-[1.3rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Need a combination?</p>
                <p className="mt-1 text-base font-bold text-slate-900">Create a recipe</p>
              </button>
            </div>
            <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1">
              {isSearchingFoods ? (
                <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600" />
                    Searching foods...
                  </span>
                </div>
              ) : quickItems.length === 0 ? (
                <div className="rounded-[1.4rem] border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                  Start typing to search, or create your own food if it is not listed yet.
                </div>
              ) : (
                quickItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={Boolean(addingItemId)}
                    onClick={() => void handleAddSearchResult(item, item.itemType === "planned_food", overlaySlotId)}
                    className={classNames(
                      "flex w-full items-center justify-between rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4 text-left transition",
                      addingItemId ? "cursor-wait opacity-85" : "hover:bg-slate-100",
                    )}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          {item.itemType.replace("_", " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{item.subtitle}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-400">{item.servingLabel}</p>
                    </div>
                    <div className="text-right">
                      {addingItemId === item.id && isBusy ? (
                        <p className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700">
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600" />
                          Adding...
                        </p>
                      ) : (
                        <>
                          <p className="font-semibold text-slate-900">{formatCalories(item.calories)}</p>
                          <p className="text-xs text-slate-500">
                            P {Math.round(item.proteinGrams)} • C {Math.round(item.carbsGrams)} • F {Math.round(item.fatGrams)}
                          </p>
                        </>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </NutritionOverlayCard>
      ) : null}

      {panelMode === "food" ? (
        <NutritionOverlayCard
          title={foodForm.id ? "Edit Custom Food" : "Create Custom Food"}
          description={
            foodForm.id
              ? "Update your reusable food."
              : `Build a reusable food and add it to ${overlaySlotLabel}.`
          }
          onClose={() => {
            closeOverlay();
            setFoodForm(emptyFoodForm());
          }}
          size="narrow"
        >
          <div className="space-y-4">
            {!foodForm.id ? (
              <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Add To
                  <select
                    value={overlaySlotId ?? ""}
                    onChange={(event) => {
                      setOverlayTargetSlotId(event.currentTarget.value);
                      setActiveSlotId(event.currentTarget.value);
                    }}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                  >
                    {mealSetup.slots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Name
              <input value={foodForm.name} onChange={(event) => {
                const value = event.currentTarget.value;
                setFoodForm((current) => ({ ...current, name: value }));
              }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Brand
              <input value={foodForm.brandName} onChange={(event) => {
                const value = event.currentTarget.value;
                setFoodForm((current) => ({ ...current, brandName: value }));
              }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Serving label
              <input value={foodForm.servingLabel} onChange={(event) => {
                const value = event.currentTarget.value;
                setFoodForm((current) => ({ ...current, servingLabel: value }));
              }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Serving amount
              <input type="number" min="0.1" step="0.1" value={foodForm.servingAmount} onChange={(event) => {
                const value = event.currentTarget.value;
                setFoodForm((current) => ({ ...current, servingAmount: value }));
              }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Calories
              <input type="number" min="0" step="1" value={foodForm.calories} onChange={(event) => {
                const value = event.currentTarget.value;
                setFoodForm((current) => ({ ...current, calories: value }));
              }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Protein
              <input type="number" min="0" step="0.1" value={foodForm.proteinGrams} onChange={(event) => {
                const value = event.currentTarget.value;
                setFoodForm((current) => ({ ...current, proteinGrams: value }));
              }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Carbs
              <input type="number" min="0" step="0.1" value={foodForm.carbsGrams} onChange={(event) => {
                const value = event.currentTarget.value;
                setFoodForm((current) => ({ ...current, carbsGrams: value }));
              }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Fat
              <input type="number" min="0" step="0.1" value={foodForm.fatGrams} onChange={(event) => {
                const value = event.currentTarget.value;
                setFoodForm((current) => ({ ...current, fatGrams: value }));
              }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" />
            </label>
            <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
              Category
              <select value={foodForm.category} onChange={(event) => {
                const value = event.currentTarget.value as FoodCategory;
                setFoodForm((current) => ({ ...current, category: value }));
              }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
                {["mixed", "protein", "carb", "fat", "fruit", "vegetable", "dairy"].map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => {
                  closeOverlay();
                  setFoodForm(emptyFoodForm());
                }}
                className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button type="button" disabled={isBusy} onClick={() => void submitFoodForm()} className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
                {foodForm.id ? "Save food" : "Create and add"}
              </button>
            </div>
          </div>
        </NutritionOverlayCard>
      ) : null}

      {panelMode === "recipe" ? (
        <NutritionOverlayCard
          title={recipeForm.id ? "Edit Recipe" : "Create Recipe"}
          description={
            recipeForm.id
              ? "Update your recipe ingredients and serving totals."
              : `Build a recipe while keeping ${overlaySlotLabel} as the current target slot.`
          }
          onClose={() => {
            closeOverlay();
            setRecipeForm(emptyRecipeForm());
            setRecipeSearchQuery("");
            setRecipeSearchResults([]);
          }}
          size="wide"
        >
          <div className="space-y-4">
            {!recipeForm.id ? (
              <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Current Slot
                  <select
                    value={overlaySlotId ?? ""}
                    onChange={(event) => {
                      setOverlayTargetSlotId(event.currentTarget.value);
                      setActiveSlotId(event.currentTarget.value);
                    }}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                  >
                    {mealSetup.slots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Recipe name
                <input value={recipeForm.name} onChange={(event) => {
                  const value = event.currentTarget.value;
                  setRecipeForm((current) => ({ ...current, name: value }));
                }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Servings
                <input type="number" min="1" step="1" value={recipeForm.servings} onChange={(event) => {
                  const value = event.currentTarget.value;
                  setRecipeForm((current) => ({ ...current, servings: value }));
                }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" />
              </label>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">Add ingredients</p>
              <input value={recipeSearchQuery} onChange={(event) => setRecipeSearchQuery(event.currentTarget.value)} placeholder="Search foods, recipes, or saved meals" className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" />
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {recipeSearchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setRecipeForm((current) => ({
                        ...current,
                        ingredients: [
                          ...current.ingredients,
                          {
                            itemType: item.itemType === "planned_food" ? "usda" : item.itemType,
                            itemId: item.sourceId ?? item.id,
                            nameSnapshot: item.name,
                            servingLabelSnapshot: item.servingLabel,
                            quantity: 1,
                            calories: item.calories,
                            proteinGrams: item.proteinGrams,
                            carbsGrams: item.carbsGrams,
                            fatGrams: item.fatGrams,
                          },
                        ],
                      }))
                    }
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:bg-slate-100"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="text-sm text-slate-500">{item.servingLabel}</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-700">Add</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {recipeForm.ingredients.length === 0 ? (
                <div className="rounded-[1.4rem] border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                  No ingredients yet.
                </div>
              ) : (
                recipeForm.ingredients.map((ingredient, index) => (
                  <div key={`${ingredient.itemId}-${index}`} className="grid gap-3 rounded-[1.4rem] border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_96px_auto]">
                    <div>
                      <p className="font-semibold text-slate-900">{ingredient.nameSnapshot}</p>
                      <p className="text-sm text-slate-500">{ingredient.servingLabelSnapshot}</p>
                    </div>
                    <input
                      type="number"
                      min="0.1"
                      step="0.25"
                      value={ingredient.quantity}
                      onChange={(event) => {
                        const nextQuantity = Number.parseFloat(event.currentTarget.value) || 1;
                        setRecipeForm((current) => ({
                          ...current,
                          ingredients: current.ingredients.map((currentIngredient, currentIndex) =>
                            currentIndex === index
                              ? {
                                  ...currentIngredient,
                                  quantity: nextQuantity,
                                  calories: Math.round((currentIngredient.calories / Math.max(currentIngredient.quantity, 0.1)) * nextQuantity * 10) / 10,
                                  proteinGrams: Math.round((currentIngredient.proteinGrams / Math.max(currentIngredient.quantity, 0.1)) * nextQuantity * 10) / 10,
                                  carbsGrams: Math.round((currentIngredient.carbsGrams / Math.max(currentIngredient.quantity, 0.1)) * nextQuantity * 10) / 10,
                                  fatGrams: Math.round((currentIngredient.fatGrams / Math.max(currentIngredient.quantity, 0.1)) * nextQuantity * 10) / 10,
                                }
                              : currentIngredient,
                          ),
                        }));
                      }}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setRecipeForm((current) => ({
                          ...current,
                          ingredients: current.ingredients.filter((_, currentIndex) => currentIndex !== index),
                        }))
                      }
                      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => {
                  closeOverlay();
                  setRecipeForm(emptyRecipeForm());
                  setRecipeSearchQuery("");
                  setRecipeSearchResults([]);
                }}
                className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button type="button" disabled={isBusy} onClick={() => void submitRecipeForm()} className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
                {recipeForm.id ? "Update recipe" : "Create recipe"}
              </button>
            </div>
          </div>
        </NutritionOverlayCard>
      ) : null}

      {panelMode === "saveMeal" ? (
        <NutritionOverlayCard
          title={savedMealForm.id ? "Edit Saved Meal" : "Save Meal"}
          description={
            savedMealForm.id
              ? "Update this saved meal."
              : `Save the current ${overlaySlotLabel} entries as a reusable meal.`
          }
          onClose={() => {
            closeOverlay();
            setSavedMealForm(emptySavedMealForm());
          }}
          size="narrow"
        >
          <div className="space-y-4">
            {!savedMealForm.id ? (
              <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Source slot: <span className="font-semibold text-slate-900">{overlaySlotLabel}</span>
              </div>
            ) : null}
            <label className="text-sm font-semibold text-slate-700">
              Name
              <input value={savedMealForm.name} onChange={(event) => {
                const value = event.currentTarget.value;
                setSavedMealForm((current) => ({ ...current, name: value }));
              }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" />
            </label>
            <div className="space-y-3">
              {savedMealForm.items.map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex items-center justify-between rounded-[1.3rem] border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="font-semibold text-slate-900">{item.name}</p>
                    <p className="text-sm text-slate-500">{item.quantity} x {item.servingLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSavedMealForm((current) => ({
                        ...current,
                        items: current.items.filter((_, currentIndex) => currentIndex !== index),
                      }))
                    }
                    className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => {
                  closeOverlay();
                  setSavedMealForm(emptySavedMealForm());
                }}
                className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button type="button" disabled={isBusy} onClick={() => void submitSavedMealForm()} className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
                {savedMealForm.id ? "Update saved meal" : "Save meal"}
              </button>
            </div>
          </div>
        </NutritionOverlayCard>
      ) : null}

      {panelMode === "setup" ? (
        <NutritionOverlayCard
          title="Edit Meal Setup"
          description={`Choose between ${MIN_MEAL_SLOTS} and ${MAX_MEAL_SLOTS} slots, rename them, and reorder them.`}
          onClose={() => setPanelMode(null)}
          size="narrow"
        >
          <div className="space-y-3">
            {mealSetupDraft.map((slot, index) => (
              <div key={slot.id} className="grid gap-3 rounded-[1.4rem] border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto]">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                  <input
                    value={slot.label}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setMealSetupDraft((current) =>
                        current.map((candidate) =>
                          candidate.id === slot.id ? { ...candidate, label: value } : candidate,
                        ),
                      );
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                  />
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() =>
                      setMealSetupDraft((current) => {
                        const next = [...current];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        return next.map((item, position) => ({ ...item, position }));
                      })
                    }
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    disabled={index === mealSetupDraft.length - 1}
                    onClick={() =>
                      setMealSetupDraft((current) => {
                        const next = [...current];
                        [next[index], next[index + 1]] = [next[index + 1], next[index]];
                        return next.map((item, position) => ({ ...item, position }));
                      })
                    }
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
                  >
                    Down
                  </button>
                </div>
                <button
                  type="button"
                  disabled={mealSetupDraft.length <= MIN_MEAL_SLOTS}
                  onClick={() =>
                    setMealSetupDraft((current) =>
                      current
                        .filter((candidate) => candidate.id !== slot.id)
                        .map((candidate, position) => ({ ...candidate, position })),
                    )
                  }
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={mealSetupDraft.length >= MAX_MEAL_SLOTS}
              onClick={() =>
                setMealSetupDraft((current) => [
                  ...current,
                  {
                    id: createMealSlotId(),
                    label: `Meal ${current.length + 1}`,
                    position: current.length,
                  },
                ])
              }
              className="w-full rounded-[1.4rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Add another slot
            </button>
            <div className="flex justify-end">
              <button type="button" disabled={isBusy} onClick={() => void submitMealSetup()} className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
                Save meal setup
              </button>
            </div>
          </div>
        </NutritionOverlayCard>
      ) : null}

      {panelMode === "mobilePlan" ? (
        <NutritionOverlayCard
          title="Gemini Meal Plan"
          description="Generated recommendations based on your nutrition setup."
          onClose={closeOverlay}
          size="wide"
        >
          <div className="space-y-4">
            <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <button
                type="button"
                disabled={!dashboard.plan || isBusy}
                onClick={() => void refreshPlanSuggestions()}
                className="w-full rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {isBusy ? "Refreshing..." : "Refresh plan"}
              </button>
              <button
                type="button"
                disabled={!dashboard.plan || recommendedFoodsCount === 0 || isBusy}
                onClick={() => void addAllPlanSuggestions()}
                className="w-full rounded-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {addingItemId === "bulk-plan"
                  ? "Adding recommendations..."
                  : `Add all recommendations (${recommendedFoodsCount})`}
              </button>
              <Link
                href="/nutrition/setup"
                className="block w-full rounded-full border border-slate-300 px-3 py-2 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
              >
                Edit inputs
              </Link>
            </div>

            {dashboard.plan ? (
              <div className="space-y-3">
                {dashboard.planSuggestions.map((suggestion) => (
                  <div key={suggestion.slot} className="rounded-[1.3rem] border border-orange-200 bg-orange-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">{suggestion.label}</p>
                    <div className="mt-2 space-y-2">
                      {suggestion.foods.map((food) => (
                        <button
                          key={`${suggestion.slot}-${food.id}`}
                          type="button"
                          onClick={() => void handleAddSearchResult(food, true, selectedSlotId ?? mealSetup.slots[0]?.id)}
                          className="flex w-full items-center justify-between rounded-2xl bg-white px-3 py-3 text-left transition hover:bg-orange-100"
                        >
                          <div className="min-w-0">
                            <p className="break-words font-semibold text-slate-900">{food.name}</p>
                            <p className="text-sm text-slate-500">{food.servingLabel}</p>
                          </div>
                          <span className="ml-3 shrink-0 text-sm font-semibold text-slate-700">{formatCalories(food.calories)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-[1.2rem] border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                No generated meal plan yet. Complete your nutrition setup to generate recommendations.
              </p>
            )}
          </div>
        </NutritionOverlayCard>
      ) : null}
    </section>
  );
}
