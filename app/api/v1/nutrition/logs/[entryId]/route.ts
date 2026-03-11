import { NextResponse } from "next/server";
import { coerceDateKey } from "@/lib/nutrition-tracking";
import { deleteLogEntry, updateLogEntry } from "@/lib/nutrition-tracking-db";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseJsonBody, parseQueryParams, parseRouteParams, v } from "@/lib/request-validation";
import { loadServerUserProfile } from "@/lib/server-profile-db";
import { assertUserCanWrite } from "@/lib/server-auth";
import type { UpdateLogEntryRequest } from "@/types/nutrition";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ entryId: string }>;
};

type UpdateBody = {
  date?: string;
  payload?: UpdateLogEntryRequest;
};

const paramsSchema = v.object({
  entryId: v.string({ trim: true, minLength: 1, maxLength: 80 }),
});

const querySchema = v.object({
  date: v.string({ trim: true, pattern: /^\d{4}-\d{2}-\d{2}$/, optional: true }),
});

const bodySchema = v.object({
  date: v.string({ trim: true, pattern: /^\d{4}-\d{2}-\d{2}$/, optional: true }),
  payload: v.object(
    {
      quantity: v.number({ min: 0.1, max: 1000, optional: true }),
      mealSlotId: v.string({ trim: true, minLength: 1, maxLength: 48, optional: true }),
      mealSlotLabel: v.string({ trim: true, minLength: 1, maxLength: 60, optional: true }),
    },
    { optional: true },
  ),
});

export async function PATCH(request: Request, context: RouteContext) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-nutrition-logs-patch",
    scope: "write",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const authContext = await assertUserCanWrite(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "v1-nutrition-logs-patch",
      uid: authContext.uid,
      scope: "write",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const { entryId } = parseRouteParams<{ entryId: string }>(await context.params, paramsSchema);

    const body = await parseJsonBody<UpdateBody>(request, bodySchema);
    if (!body?.payload || typeof body.payload !== "object") {
      return NextResponse.json({ message: "payload is required." }, { status: 400 });
    }
    if (Object.keys(body.payload).length === 0) {
      return NextResponse.json({ message: "payload must include at least one field." }, { status: 400 });
    }

    const profile = await loadServerUserProfile(authContext.uid);
    const log = await updateLogEntry({
      uid: authContext.uid,
      date: coerceDateKey(body.date),
      entryId,
      payload: body.payload,
      mealsPerDay: profile?.mealsPerDay ?? null,
    });
    return NextResponse.json(log);
  } catch (error) {
    console.error("PATCH /api/v1/nutrition/logs/[entryId] failed", error);
    if (error instanceof InputValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to update nutrition log entry.";
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

export async function DELETE(request: Request, context: RouteContext) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-nutrition-logs-delete",
    scope: "write",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const authContext = await assertUserCanWrite(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "v1-nutrition-logs-delete",
      uid: authContext.uid,
      scope: "write",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const { entryId } = parseRouteParams<{ entryId: string }>(await context.params, paramsSchema);

    const query = parseQueryParams<{ date?: string }>(request, querySchema);
    const profile = await loadServerUserProfile(authContext.uid);
    const log = await deleteLogEntry({
      uid: authContext.uid,
      date: coerceDateKey(query.date ?? null),
      entryId,
      mealsPerDay: profile?.mealsPerDay ?? null,
    });
    return NextResponse.json(log);
  } catch (error) {
    console.error("DELETE /api/v1/nutrition/logs/[entryId] failed", error);
    if (error instanceof InputValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to delete nutrition log entry.";
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
