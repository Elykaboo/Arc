import "server-only";
import { sumEstimatedItems } from "@/lib/nutrition-estimate";
import { readServerSecret } from "@/lib/server-secrets";
import type { MacroTargets, PhotoMacroEstimateItem, PhotoMacroEstimateResponse } from "@/types/nutrition";

type GeminiItemPayload = {
  name?: unknown;
  grams?: unknown;
  calories?: unknown;
  proteinGrams?: unknown;
  carbsGrams?: unknown;
  fatGrams?: unknown;
};

type GeminiEstimatePayload = {
  items?: unknown;
  totals?: {
    calories?: unknown;
    proteinGrams?: unknown;
    carbsGrams?: unknown;
    fatGrams?: unknown;
  };
};

type GeminiApiErrorBody = {
  error?: {
    code?: unknown;
    message?: unknown;
    status?: unknown;
    details?: Array<{
      "@type"?: unknown;
      retryDelay?: unknown;
    }>;
  };
};

export class GeminiApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(message: string, status: number, retryAfterSeconds?: number | null) {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds ?? null;
  }
}

const toFiniteNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const round = (value: number) => Math.round(value * 10) / 10;

const normalizeMacroTargets = (value: GeminiEstimatePayload["totals"] | undefined): MacroTargets => ({
  calories: round(Math.max(0, toFiniteNumber(value?.calories, 0))),
  proteinGrams: round(Math.max(0, toFiniteNumber(value?.proteinGrams, 0))),
  carbsGrams: round(Math.max(0, toFiniteNumber(value?.carbsGrams, 0))),
  fatGrams: round(Math.max(0, toFiniteNumber(value?.fatGrams, 0))),
});

const stripJsonFence = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
};

const extractJsonObject = (value: string): string => {
  const text = stripJsonFence(value);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Gemini response did not include JSON.");
  }
  return text.slice(start, end + 1);
};

const normalizeItems = (items: unknown): PhotoMacroEstimateItem[] => {
  if (!Array.isArray(items)) return [];

  return items
    .map((raw, index) => {
      const row = raw as GeminiItemPayload;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!name) return null;

      const grams = round(Math.max(1, toFiniteNumber(row.grams, 0)));
      const calories = round(Math.max(0, toFiniteNumber(row.calories, 0)));
      const proteinGrams = round(Math.max(0, toFiniteNumber(row.proteinGrams, 0)));
      const carbsGrams = round(Math.max(0, toFiniteNumber(row.carbsGrams, 0)));
      const fatGrams = round(Math.max(0, toFiniteNumber(row.fatGrams, 0)));

      return {
        id: `estimate-${Date.now().toString(36)}-${index}`,
        name,
        grams,
        calories,
        proteinGrams,
        carbsGrams,
        fatGrams,
      } satisfies PhotoMacroEstimateItem;
    })
    .filter((item): item is PhotoMacroEstimateItem => Boolean(item));
};

export const normalizeGeminiEstimateResponse = (rawText: string, model: string): PhotoMacroEstimateResponse => {
  let parsed: GeminiEstimatePayload;
  try {
    parsed = JSON.parse(extractJsonObject(rawText)) as GeminiEstimatePayload;
  } catch {
    throw new Error("Gemini estimate could not be parsed.");
  }

  const items = normalizeItems(parsed.items);
  if (items.length === 0) {
    throw new Error("Gemini estimate returned no food items.");
  }

  const totalsFromItems = sumEstimatedItems(items);
  const providedTotals = normalizeMacroTargets(parsed.totals);
  const totals =
    providedTotals.calories > 0 ||
    providedTotals.proteinGrams > 0 ||
    providedTotals.carbsGrams > 0 ||
    providedTotals.fatGrams > 0
      ? providedTotals
      : totalsFromItems;

  return {
    items,
    totals,
    model,
  };
};

const parseImageDataUrl = (imageDataUrl: string): { mimeType: string; base64: string } => {
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) {
    throw new Error("Photo must be a valid base64 image data URL.");
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2].replace(/\s+/g, "");
  if (!base64) {
    throw new Error("Photo payload is empty.");
  }

  // Keep payloads bounded so API requests remain reliable.
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > 5 * 1024 * 1024) {
    throw new Error("Photo is too large. Please upload an image under 5MB.");
  }

  return { mimeType, base64 };
};

const buildPrompt = () => `You are a nutrition macro estimator.
Estimate all visible foods in the image.
Return strict JSON only with this shape:
{
  "items": [
    {
      "name": "string",
      "grams": number,
      "calories": number,
      "proteinGrams": number,
      "carbsGrams": number,
      "fatGrams": number
    }
  ],
  "totals": {
    "calories": number,
    "proteinGrams": number,
    "carbsGrams": number,
    "fatGrams": number
  }
}
Rules:
- Use per-food rows, not one combined row.
- grams must be realistic edible weight estimates.
- Macros must be non-negative.
- Include all major foods shown.
- No markdown, no explanation text, JSON only.`;

const parseRetrySeconds = (details: GeminiApiErrorBody["error"]["details"]): number | null => {
  if (!Array.isArray(details)) return null;
  const retryInfo = details.find((detail) => detail?.["@type"] === "type.googleapis.com/google.rpc.RetryInfo");
  const retryDelay = typeof retryInfo?.retryDelay === "string" ? retryInfo.retryDelay : "";
  const match = retryDelay.match(/^(\d+)s$/);
  if (!match) return null;
  const seconds = Number.parseInt(match[1], 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

export const estimateMacrosFromFoodPhoto = async (imageDataUrl: string): Promise<PhotoMacroEstimateResponse> => {
  const apiKey = readServerSecret("GEMINI_API_KEY");
  const model = readServerSecret("GEMINI_MODEL", { defaultValue: "gemini-2.0-flash", required: false });
  const { mimeType, base64 } = parseImageDataUrl(imageDataUrl);

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: buildPrompt() },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64,
                },
              },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const fallbackMessage = "Gemini could not estimate this photo right now.";
    const text = await response.text().catch(() => "");
    let parsed: GeminiApiErrorBody | null = null;
    try {
      parsed = text ? (JSON.parse(text) as GeminiApiErrorBody) : null;
    } catch {
      parsed = null;
    }

    const providerMessage = typeof parsed?.error?.message === "string" ? parsed.error.message.trim() : "";
    const retryAfterSeconds = parseRetrySeconds(parsed?.error?.details);
    if (response.status === 429) {
      throw new GeminiApiError(
        retryAfterSeconds
          ? `Gemini quota is currently exhausted. Please retry in about ${retryAfterSeconds} seconds.`
          : "Gemini quota is currently exhausted. Please retry shortly or update Gemini billing/quota.",
        429,
        retryAfterSeconds,
      );
    }

    throw new GeminiApiError(providerMessage || fallbackMessage, response.status || 502, retryAfterSeconds);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("\n")
      .trim() || "";

  if (!text) {
    throw new Error("Gemini response was empty.");
  }

  return normalizeGeminiEstimateResponse(text, model);
};
