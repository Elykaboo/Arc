import { addMacros, emptyMacros } from "@/lib/nutrition-tracking";
import type { MacroTargets, PhotoMacroEstimateItem } from "@/types/nutrition";

const round = (value: number) => Math.round(value * 10) / 10;

export const scaleEstimatedItemByGrams = (item: PhotoMacroEstimateItem, grams: number): PhotoMacroEstimateItem => {
  const resolvedGrams = round(Math.max(1, grams));
  const ratio = resolvedGrams / Math.max(1, item.grams);
  return {
    ...item,
    grams: resolvedGrams,
    calories: round(item.calories * ratio),
    proteinGrams: round(item.proteinGrams * ratio),
    carbsGrams: round(item.carbsGrams * ratio),
    fatGrams: round(item.fatGrams * ratio),
  };
};

export const sumEstimatedItems = (items: PhotoMacroEstimateItem[]): MacroTargets =>
  items.reduce(
    (totals, item) =>
      addMacros(totals, {
        calories: item.calories,
        proteinGrams: item.proteinGrams,
        carbsGrams: item.carbsGrams,
        fatGrams: item.fatGrams,
      }),
    emptyMacros(),
  );
