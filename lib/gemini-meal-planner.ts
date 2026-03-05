import type { FoodCatalogItem, MealRefinementSuggestion, PlannedMeal } from "@/types/nutrition";

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";

const parseSuggestion = (rawText: string): MealRefinementSuggestion | null => {
  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) return null;

  try {
    const parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1)) as MealRefinementSuggestion;
    if (!Array.isArray(parsed.meals)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const refineMealPlanWithGemini = async ({
  profile,
  nutritionGoal,
  mealsPerDay,
  targets,
  meals,
  candidates,
}: {
  profile: {
    sex: string;
    age: number;
    heightCm: number;
    weightKg: number;
    activityLevel: string;
  };
  nutritionGoal: string | null;
  mealsPerDay: number;
  targets: {
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
  };
  meals: PlannedMeal[];
  candidates: FoodCatalogItem[];
}): Promise<MealRefinementSuggestion | null> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: [
                  "You are refining a nutrition meal plan for a specific user profile.",
                  "Do not invent foods, IDs, meal slots, or nutrient values.",
                  "Return JSON only with shape: {\"meals\":[{\"slot\":\"breakfast\",\"label\":\"...\",\"items\":[{\"foodId\":\"...\",\"quantity\":1}]}]}",
                  "Rules:",
                  "- Keep exactly the same meal slots as Current meals, no extras and no missing slots.",
                  "- Use only foodId values from Allowed foods.",
                  "- Keep quantity between 0.25 and 4.0 and use 0.25 increments.",
                  "- Prefer foods tagged for that meal slot (breakfast/lunch/dinner/snack).",
                  "- Try to match daily macro targets as closely as possible.",
                  "- Hard constraint: daily calories, protein, carbs, and fat must NOT exceed Targets.",
                  `User profile: ${JSON.stringify(profile)}`,
                  `Nutrition goal: ${nutritionGoal ?? "maintain"}`,
                  `Meals per day: ${mealsPerDay}`,
                  `Targets: ${JSON.stringify(targets)}`,
                  `Current meals: ${JSON.stringify(meals)}`,
                  `Allowed foods: ${JSON.stringify(candidates.map((item) => ({
                    foodId: item.foodId,
                    name: item.name,
                    category: item.category,
                    mealTags: item.mealTags,
                    servingLabel: item.servingLabel,
                    calories: item.calories,
                    proteinGrams: item.proteinGrams,
                    carbsGrams: item.carbsGrams,
                    fatGrams: item.fatGrams,
                  })))}`,
                ].join("\n"),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
  return parseSuggestion(text);
};
