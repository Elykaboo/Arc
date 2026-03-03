export type Sex = "male" | "female" | "other";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

export type NutritionGoal = "lose" | "maintain" | "gain";

export type GoalMode = "preset" | "manual";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack1" | "snack2";

export type MacroTargets = {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
};

export type FoodSource = "usda" | "local";

export type FoodCategory =
  | "protein"
  | "carb"
  | "fat"
  | "fruit"
  | "vegetable"
  | "dairy"
  | "mixed";

export type MealTag = "breakfast" | "lunch" | "dinner" | "snack";

export type FoodCatalogItem = {
  source: FoodSource;
  foodId: string;
  name: string;
  category: FoodCategory;
  servingLabel: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  mealTags: MealTag[];
  priority: number;
};

export type UsdaFoodItem = FoodCatalogItem & {
  fdcId: number;
  dataType: string;
  brandOwner?: string;
};

export type MealPlanFood = {
  source: FoodSource;
  foodId: string;
  name: string;
  servingLabel: string;
  quantity: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
};

export type PlannedMeal = {
  slot: MealSlot;
  label: string;
  totals: MacroTargets;
  foods: MealPlanFood[];
};

export type NutritionProfileSnapshot = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
};

export type ActiveNutritionPlan = {
  goalMode: GoalMode;
  nutritionGoal: NutritionGoal | null;
  dailyCalorieOverride: number | null;
  mealsPerDay: number;
  profileSnapshot: NutritionProfileSnapshot;
  targets: MacroTargets;
  meals: PlannedMeal[];
  warnings: string[];
  generation: {
    baseSource: "usda" | "mixed";
    aiRefined: boolean;
    aiProvider: "gemini" | null;
  };
  generatedAt: string;
};

export type CreateNutritionPlanRequest = {
  sex?: Sex;
  age?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: ActivityLevel;
  nutritionGoal?: NutritionGoal;
  dailyCalorieOverride?: number | null;
  mealsPerDay?: number | null;
};

export type NutritionPlanResponse = {
  plan: ActiveNutritionPlan;
};

export type OnboardingStatusResponse = {
  onboardingComplete: boolean;
  missingFields: string[];
};

export type MealRefinementSuggestion = {
  meals: Array<{
    slot: MealSlot;
    label: string;
    items: Array<{
      foodId: string;
      quantity: number;
    }>;
  }>;
};
