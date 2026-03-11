export type Sex = "male" | "female" | "other";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

export type NutritionGoal = "lose" | "maintain" | "gain";

export type GoalMode = "preset" | "manual";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack1" | "snack2" | "snack3" | "snack4";

export type MacroTargets = {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
};

export type FoodSource = "catalog" | "local" | "usda";

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

export type CatalogFoodItem = FoodCatalogItem & {
  sourceGroup?: string;
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
    baseSource: "catalog" | "mixed" | "usda";
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

export type NutritionLibraryItemType = "catalog" | "usda" | "custom_food" | "recipe" | "saved_meal" | "planned_food";

export type NutritionLogDate = string;

export type MealSlotConfig = {
  id: string;
  label: string;
  position: number;
};

export type MealSetup = {
  uid: string;
  slots: MealSlotConfig[];
  updatedAt?: string;
};

export type CustomFood = {
  id: string;
  uid: string;
  name: string;
  brandName: string | null;
  servingLabel: string;
  servingAmount: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  category: FoodCategory;
  createdAt: string;
  updatedAt: string;
};

export type RecipeIngredient = {
  itemType: Exclude<NutritionLibraryItemType, "planned_food">;
  itemId: string;
  nameSnapshot: string;
  servingLabelSnapshot: string;
  quantity: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
};

export type Recipe = {
  id: string;
  uid: string;
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
  totals: MacroTargets;
  perServing: MacroTargets;
  createdAt: string;
  updatedAt: string;
};

export type SavedMealItem = {
  itemType: Exclude<NutritionLibraryItemType, "planned_food">;
  sourceId: string | null;
  name: string;
  servingLabel: string;
  quantity: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
};

export type SavedMeal = {
  id: string;
  uid: string;
  name: string;
  slotSuggestionId: string | null;
  slotSuggestionLabel: string | null;
  items: SavedMealItem[];
  totals: MacroTargets;
  createdAt: string;
  updatedAt: string;
};

export type LoggedFoodEntry = {
  id: string;
  entryType: NutritionLibraryItemType;
  sourceId: string | null;
  name: string;
  servingLabel: string;
  quantity: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  mealSlotId: string;
  mealSlotLabelSnapshot: string;
  loggedAt: string;
  createdFromPlan: boolean;
};

export type LoggedMeal = {
  slotId: string;
  slotLabel: string;
  entries: LoggedFoodEntry[];
  totals: MacroTargets;
};

export type DailyNutritionLog = {
  date: NutritionLogDate;
  uid: string;
  targetSnapshot: MacroTargets;
  mealSetupSnapshot: MealSlotConfig[];
  meals: LoggedMeal[];
  totals: MacroTargets;
  remaining: MacroTargets;
  updatedAt?: string;
};

export type NutritionSearchResult = {
  id: string;
  itemType: NutritionLibraryItemType;
  sourceId: string | null;
  name: string;
  subtitle: string;
  servingLabel: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  brandName?: string;
  slotSuggestionId?: string | null;
  slotSuggestionLabel?: string | null;
};

export type NutritionPlanSuggestion = {
  slot: MealSlot;
  label: string;
  foods: NutritionSearchResult[];
};

export type NutritionDashboardResponse = {
  date: NutritionLogDate;
  targets: MacroTargets;
  totals: MacroTargets;
  remaining: MacroTargets;
  mealSetup: MealSetup;
  meals: LoggedMeal[];
  recentItems: NutritionSearchResult[];
  frequentItems: NutritionSearchResult[];
  myFoodsCount: number;
  myRecipesCount: number;
  myMealsCount: number;
  planSuggestions: NutritionPlanSuggestion[];
  plan: ActiveNutritionPlan | null;
};

export type CreateCustomFoodRequest = {
  name: string;
  brandName?: string | null;
  servingLabel: string;
  servingAmount: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  category: FoodCategory;
};

export type CreateRecipeRequest = {
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
};

export type CreateSavedMealRequest = {
  name: string;
  slotSuggestionId?: string | null;
  slotSuggestionLabel?: string | null;
  items: SavedMealItem[];
};

export type CreateLogEntryRequest = {
  mealSlotId: string;
  mealSlotLabel?: string;
  entryType: NutritionLibraryItemType;
  sourceId?: string | null;
  quantity?: number;
  name?: string;
  servingLabel?: string;
  calories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
  createdFromPlan?: boolean;
};

export type UpdateLogEntryRequest = {
  quantity?: number;
  mealSlotId?: string;
  mealSlotLabel?: string;
};

export type PhotoMacroEstimateItem = {
  id: string;
  name: string;
  grams: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
};

export type PhotoMacroEstimateResponse = {
  items: PhotoMacroEstimateItem[];
  totals: MacroTargets;
  model: string;
};

export type EstimatePhotoRequest = {
  imageDataUrl: string;
};
