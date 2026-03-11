import { NextResponse } from "next/server";
import { enforceUserRateLimit } from "@/lib/ai-rate-limit";
import { estimateMacrosFromFoodPhoto, GeminiApiError } from "@/lib/gemini-nutrition";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseJsonBody, v } from "@/lib/request-validation";
import { assertUserCanWrite } from "@/lib/server-auth";
import type { EstimatePhotoRequest } from "@/types/nutrition";

export const runtime = "nodejs";

const parseLimit = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const bodySchema = v.object({
  imageDataUrl: v.string({ trim: true, minLength: 32, maxLength: 8_000_000 }),
});

export async function POST(request: Request) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "v1-nutrition-estimate-photo",
    scope: "expensive",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const authContext = await assertUserCanWrite(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "v1-nutrition-estimate-photo",
      uid: authContext.uid,
      scope: "expensive",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const rateLimit = await enforceUserRateLimit({
      uid: authContext.uid,
      feature: "nutrition-photo-estimate",
      perMinuteLimit: parseLimit(process.env.GEMINI_MACRO_MINUTE_LIMIT, 4),
      perDayLimit: parseLimit(process.env.GEMINI_MACRO_DAILY_LIMIT, 25),
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          message: `Rate limit exceeded for ${rateLimit.scope} window.`,
          rateLimit,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    const body = await parseJsonBody<EstimatePhotoRequest>(request, bodySchema);

    const estimate = await estimateMacrosFromFoodPhoto(body.imageDataUrl);
    return NextResponse.json(estimate);
  } catch (error) {
    console.error("POST /api/v1/nutrition/estimate-photo failed", error);
    if (error instanceof InputValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof GeminiApiError) {
      return NextResponse.json(
        {
          message: error.message,
        },
        {
          status: error.status,
          headers: error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : undefined,
        },
      );
    }

    const message = error instanceof Error ? error.message : "Unable to estimate macros from photo.";
    const status = /suspended/i.test(message)
      ? 403
      : /token|bearer|unauthorized/i.test(message)
        ? 401
        : /missing|invalid|required|not found|unsupported|too large|base64/i.test(message)
          ? 400
          : 500;
    return NextResponse.json({ message }, { status });
  }
}
