import { NextResponse } from "next/server";
import { addLogEntry } from "@/lib/nutrition-tracking-db";
import { coerceDateKey } from "@/lib/nutrition-tracking";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseJsonBody, v } from "@/lib/request-validation";
import { loadServerUserProfile } from "@/lib/server-profile-db";
import { assertUserCanWrite } from "@/lib/server-auth";
import type { CreateLogEntryRequest } from "@/types/nutrition";

export const runtime = "nodejs";

type LogsPostBody = {
  date?: string;
  payload?: CreateLogEntryRequest | CreateLogEntryRequest[];
};

const logEntrySchema = v.object({
  mealSlotId: v.string({ trim: true, minLength: 1, maxLength: 48 }),
  mealSlotLabel: v.string({ trim: true, minLength: 1, maxLength: 60, optional: true }),
  entryType: v.enum(["catalog", "usda", "custom_food", "recipe", "saved_meal", "planned_food"]),
  sourceId: v.string({ trim: true, minLength: 1, maxLength: 120, optional: true, nullable: true }),
  quantity: v.number({ min: 0.1, max: 1000, optional: true }),
  name: v.string({ trim: true, minLength: 1, maxLength: 120, optional: true }),
  servingLabel: v.string({ trim: true, minLength: 1, maxLength: 80, optional: true }),
  calories: v.number({ min: 0, max: 10000, optional: true }),
  proteinGrams: v.number({ min: 0, max: 1000, optional: true }),
  carbsGrams: v.number({ min: 0, max: 1000, optional: true }),
  fatGrams: v.number({ min: 0, max: 1000, optional: true }),
  createdFromPlan: v.boolean({ optional: true }),
});

const bodySchema = v.object({
  date: v.string({ trim: true, pattern: /^\d{4}-\d{2}-\d{2}$/, optional: true }),
  payload: v.union([logEntrySchema, v.array(logEntrySchema, { minItems: 1, maxItems: 50 })], { optional: true }),
});

export async function POST(request: Request) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-nutrition-logs-post",
    scope: "write",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const authContext = await assertUserCanWrite(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "v1-nutrition-logs-post",
      uid: authContext.uid,
      scope: "write",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const body = await parseJsonBody<LogsPostBody>(request, bodySchema);
    const payload = body?.payload;
    if (!payload) {
      return NextResponse.json({ message: "payload is required." }, { status: 400 });
    }

    const date = coerceDateKey(body.date);
    const profile = await loadServerUserProfile(authContext.uid);
    const payloads = Array.isArray(payload) ? payload : [payload];

    let latestLog = null;
    for (const item of payloads) {
      latestLog = await addLogEntry({
        uid: authContext.uid,
        date,
        payload: item,
        mealsPerDay: profile?.mealsPerDay ?? null,
      });
    }

    return NextResponse.json(latestLog);
  } catch (error) {
    console.error("POST /api/v1/nutrition/logs failed", error);
    if (error instanceof InputValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to save nutrition log entry.";
    const status = /suspended/i.test(message)
      ? 403
      : /token|bearer|unauthorized/i.test(message)
        ? 401
        : /missing|invalid|required|not found|unsupported/i.test(message)
          ? 400
          : 500;
    return NextResponse.json({ message }, { status });
  }
}
