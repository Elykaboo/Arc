import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGeminiEstimateResponse } from "@/lib/gemini-nutrition";

test("normalizeGeminiEstimateResponse parses fenced JSON", () => {
  const raw = `\`\`\`json
{
  "items": [
    {
      "name": "Chicken breast",
      "grams": 150,
      "calories": 250,
      "proteinGrams": 46,
      "carbsGrams": 0,
      "fatGrams": 5
    },
    {
      "name": "Rice",
      "grams": 120,
      "calories": 156,
      "proteinGrams": 3,
      "carbsGrams": 34,
      "fatGrams": 0.3
    }
  ]
}
\`\`\``;

  const normalized = normalizeGeminiEstimateResponse(raw, "gemini-2.0-flash");
  assert.equal(normalized.items.length, 2);
  assert.equal(normalized.model, "gemini-2.0-flash");
  assert.equal(normalized.totals.calories, 406);
  assert.equal(normalized.totals.proteinGrams, 49);
  assert.equal(normalized.totals.carbsGrams, 34);
  assert.equal(normalized.totals.fatGrams, 5.3);
});

test("normalizeGeminiEstimateResponse rejects malformed content", () => {
  assert.throws(
    () => normalizeGeminiEstimateResponse("not-json", "gemini-2.0-flash"),
    /could not be parsed/i,
  );
});
