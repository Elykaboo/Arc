import test from "node:test";
import assert from "node:assert/strict";
import { scaleEstimatedItemByGrams, sumEstimatedItems } from "@/lib/nutrition-estimate";

test("scaleEstimatedItemByGrams rescales macros proportionally", () => {
  const item = {
    id: "item-1",
    name: "Rice",
    grams: 100,
    calories: 130,
    proteinGrams: 2.5,
    carbsGrams: 28,
    fatGrams: 0.3,
  };

  const scaled = scaleEstimatedItemByGrams(item, 150);
  assert.equal(scaled.grams, 150);
  assert.equal(scaled.calories, 195);
  assert.equal(scaled.proteinGrams, 3.8);
  assert.equal(scaled.carbsGrams, 42);
  assert.equal(scaled.fatGrams, 0.5);
});

test("sumEstimatedItems aggregates totals", () => {
  const totals = sumEstimatedItems([
    {
      id: "1",
      name: "Chicken",
      grams: 120,
      calories: 210,
      proteinGrams: 32,
      carbsGrams: 0,
      fatGrams: 8,
    },
    {
      id: "2",
      name: "Rice",
      grams: 150,
      calories: 195,
      proteinGrams: 3.8,
      carbsGrams: 42,
      fatGrams: 0.5,
    },
  ]);

  assert.equal(totals.calories, 405);
  assert.equal(totals.proteinGrams, 35.8);
  assert.equal(totals.carbsGrams, 42);
  assert.equal(totals.fatGrams, 8.5);
});
