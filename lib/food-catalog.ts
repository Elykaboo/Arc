import type { FoodCatalogItem } from "@/types/nutrition";

export const fallbackFoodCatalog: FoodCatalogItem[] = [
  { source: "local", foodId: "local-eggs", name: "Eggs", category: "protein", servingLabel: "2 large eggs", calories: 140, proteinGrams: 12, carbsGrams: 1, fatGrams: 10, mealTags: ["breakfast"], priority: 10 },
  { source: "local", foodId: "local-egg-whites", name: "Egg Whites", category: "protein", servingLabel: "150 g", calories: 75, proteinGrams: 16, carbsGrams: 1, fatGrams: 0, mealTags: ["breakfast", "snack"], priority: 10 },
  { source: "local", foodId: "local-oats", name: "Oats", category: "carb", servingLabel: "40 g dry", calories: 150, proteinGrams: 5, carbsGrams: 27, fatGrams: 3, mealTags: ["breakfast"], priority: 10 },
  { source: "local", foodId: "local-greek-yogurt", name: "Greek Yogurt", category: "dairy", servingLabel: "170 g", calories: 100, proteinGrams: 17, carbsGrams: 6, fatGrams: 0, mealTags: ["breakfast", "snack"], priority: 10 },
  { source: "local", foodId: "local-whey", name: "Whey Protein", category: "protein", servingLabel: "1 scoop", calories: 120, proteinGrams: 24, carbsGrams: 3, fatGrams: 1, mealTags: ["breakfast", "snack"], priority: 10 },
  { source: "local", foodId: "local-chicken", name: "Chicken Breast", category: "protein", servingLabel: "120 g cooked", calories: 198, proteinGrams: 37, carbsGrams: 0, fatGrams: 4, mealTags: ["lunch", "dinner"], priority: 10 },
  { source: "local", foodId: "local-lean-beef", name: "Lean Beef", category: "protein", servingLabel: "120 g cooked", calories: 220, proteinGrams: 30, carbsGrams: 0, fatGrams: 11, mealTags: ["lunch", "dinner"], priority: 8 },
  { source: "local", foodId: "local-salmon", name: "Salmon", category: "protein", servingLabel: "120 g cooked", calories: 240, proteinGrams: 27, carbsGrams: 0, fatGrams: 14, mealTags: ["lunch", "dinner"], priority: 8 },
  { source: "local", foodId: "local-tuna", name: "Tuna", category: "protein", servingLabel: "120 g", calories: 140, proteinGrams: 30, carbsGrams: 0, fatGrams: 1, mealTags: ["lunch", "snack"], priority: 8 },
  { source: "local", foodId: "local-tofu", name: "Tofu", category: "protein", servingLabel: "150 g", calories: 135, proteinGrams: 15, carbsGrams: 4, fatGrams: 8, mealTags: ["lunch", "dinner"], priority: 6 },
  { source: "local", foodId: "local-rice", name: "Rice", category: "carb", servingLabel: "1 cup cooked", calories: 205, proteinGrams: 4, carbsGrams: 45, fatGrams: 0, mealTags: ["lunch", "dinner"], priority: 10 },
  { source: "local", foodId: "local-sweet-potato", name: "Sweet Potato", category: "carb", servingLabel: "200 g baked", calories: 180, proteinGrams: 4, carbsGrams: 41, fatGrams: 0, mealTags: ["lunch", "dinner"], priority: 8 },
  { source: "local", foodId: "local-pasta", name: "Pasta", category: "carb", servingLabel: "1 cup cooked", calories: 200, proteinGrams: 7, carbsGrams: 39, fatGrams: 1, mealTags: ["lunch", "dinner"], priority: 6 },
  { source: "local", foodId: "local-bread", name: "Whole Wheat Bread", category: "carb", servingLabel: "2 slices", calories: 160, proteinGrams: 8, carbsGrams: 28, fatGrams: 2, mealTags: ["breakfast", "snack"], priority: 7 },
  { source: "local", foodId: "local-banana", name: "Banana", category: "fruit", servingLabel: "1 medium banana", calories: 105, proteinGrams: 1, carbsGrams: 27, fatGrams: 0, mealTags: ["breakfast", "snack"], priority: 9 },
  { source: "local", foodId: "local-apple", name: "Apple", category: "fruit", servingLabel: "1 medium apple", calories: 95, proteinGrams: 0, carbsGrams: 25, fatGrams: 0, mealTags: ["snack"], priority: 8 },
  { source: "local", foodId: "local-berries", name: "Berries", category: "fruit", servingLabel: "1 cup", calories: 70, proteinGrams: 1, carbsGrams: 17, fatGrams: 0, mealTags: ["breakfast", "snack"], priority: 7 },
  { source: "local", foodId: "local-avocado", name: "Avocado", category: "fat", servingLabel: "100 g", calories: 160, proteinGrams: 2, carbsGrams: 9, fatGrams: 15, mealTags: ["lunch", "dinner"], priority: 5 },
  { source: "local", foodId: "local-peanut-butter", name: "Peanut Butter", category: "fat", servingLabel: "2 tbsp", calories: 190, proteinGrams: 8, carbsGrams: 7, fatGrams: 16, mealTags: ["breakfast", "snack"], priority: 7 },
  { source: "local", foodId: "local-almonds", name: "Almonds", category: "fat", servingLabel: "28 g", calories: 164, proteinGrams: 6, carbsGrams: 6, fatGrams: 14, mealTags: ["snack"], priority: 5 },
  { source: "local", foodId: "local-olive-oil", name: "Olive Oil", category: "fat", servingLabel: "1 tbsp", calories: 119, proteinGrams: 0, carbsGrams: 0, fatGrams: 14, mealTags: ["lunch", "dinner"], priority: 4 },
  { source: "local", foodId: "local-broccoli", name: "Broccoli", category: "vegetable", servingLabel: "1 cup cooked", calories: 55, proteinGrams: 4, carbsGrams: 11, fatGrams: 1, mealTags: ["lunch", "dinner"], priority: 7 },
  { source: "local", foodId: "local-spinach", name: "Spinach", category: "vegetable", servingLabel: "2 cups", calories: 15, proteinGrams: 2, carbsGrams: 2, fatGrams: 0, mealTags: ["breakfast", "lunch", "dinner"], priority: 5 },
  { source: "local", foodId: "local-mixed-veg", name: "Mixed Vegetables", category: "vegetable", servingLabel: "1 cup", calories: 80, proteinGrams: 3, carbsGrams: 15, fatGrams: 0, mealTags: ["lunch", "dinner"], priority: 6 },
  { source: "local", foodId: "local-cottage-cheese", name: "Cottage Cheese", category: "dairy", servingLabel: "1 cup", calories: 180, proteinGrams: 24, carbsGrams: 8, fatGrams: 5, mealTags: ["breakfast", "snack"], priority: 7 },
  { source: "local", foodId: "local-milk", name: "Milk", category: "dairy", servingLabel: "1 cup", calories: 110, proteinGrams: 8, carbsGrams: 12, fatGrams: 2, mealTags: ["breakfast", "snack"], priority: 5 },
];

export const searchFallbackFoods = ({
  search,
  category,
  mealTag,
  limit,
}: {
  search?: string;
  category?: string;
  mealTag?: string;
  limit?: number;
}): FoodCatalogItem[] => {
  const query = search?.trim().toLowerCase() || "";
  const maxItems = limit && limit > 0 ? limit : 25;

  return fallbackFoodCatalog
    .filter((item) => {
      if (query && !item.name.toLowerCase().includes(query)) return false;
      if (category && item.category !== category) return false;
      if (mealTag && !item.mealTags.includes(mealTag as never)) return false;
      return true;
    })
    .slice(0, maxItems);
};
