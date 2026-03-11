import { getAuthHeaders } from "@/lib/authenticated-fetch";
import type {
  CreateLogEntryRequest,
  DailyNutritionLog,
  EstimatePhotoRequest,
  MealSlotConfig,
  MealSetup,
  NutritionDashboardResponse,
  PhotoMacroEstimateResponse,
  UpdateLogEntryRequest,
} from "@/types/nutrition";

const parseError = async (response: Response): Promise<Error> => {
  const fallback = `Request failed (${response.status})`;
  const retryAfter = response.headers.get("Retry-After");
  try {
    const data = (await response.json()) as { message?: string };
    if (typeof data.message === "string" && data.message.trim()) {
      const suffix = retryAfter ? ` (retry in ~${retryAfter}s)` : "";
      return new Error(`${data.message.trim()}${suffix}`);
    }
  } catch {
    // Ignore JSON parsing failures and use status fallback.
  }
  return new Error(fallback);
};

const authedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const headers = await getAuthHeaders();
  const response = await fetch(input, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return response;
};

export const fetchNutritionDashboard = async (date: string): Promise<NutritionDashboardResponse> => {
  const response = await authedFetch(`/api/v1/nutrition/dashboard?date=${encodeURIComponent(date)}`, {
    method: "GET",
    cache: "no-store",
  });
  return (await response.json()) as NutritionDashboardResponse;
};

export const fetchMealSetup = async (): Promise<MealSetup> => {
  const response = await authedFetch("/api/v1/nutrition/meal-setup", {
    method: "GET",
    cache: "no-store",
  });
  return (await response.json()) as MealSetup;
};

export const saveMealSetup = async ({
  date,
  slots,
}: {
  date: string;
  slots: MealSlotConfig[];
}): Promise<MealSetup> => {
  const response = await authedFetch("/api/v1/nutrition/meal-setup", {
    method: "PUT",
    body: JSON.stringify({
      date,
      slots,
    }),
  });
  return (await response.json()) as MealSetup;
};

export const createNutritionLogEntries = async ({
  date,
  payload,
}: {
  date: string;
  payload: CreateLogEntryRequest[];
}): Promise<DailyNutritionLog> => {
  const response = await authedFetch("/api/v1/nutrition/logs", {
    method: "POST",
    body: JSON.stringify({
      date,
      payload,
    }),
  });
  return (await response.json()) as DailyNutritionLog;
};

export const estimatePhotoNutrition = async (body: EstimatePhotoRequest): Promise<PhotoMacroEstimateResponse> => {
  const response = await authedFetch("/api/v1/nutrition/estimate-photo", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return (await response.json()) as PhotoMacroEstimateResponse;
};

export const updateNutritionLogEntry = async ({
  date,
  entryId,
  payload,
}: {
  date: string;
  entryId: string;
  payload: UpdateLogEntryRequest;
}): Promise<DailyNutritionLog> => {
  const response = await authedFetch(`/api/v1/nutrition/logs/${encodeURIComponent(entryId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      date,
      payload,
    }),
  });
  return (await response.json()) as DailyNutritionLog;
};

export const deleteNutritionLogEntry = async ({
  date,
  entryId,
}: {
  date: string;
  entryId: string;
}): Promise<DailyNutritionLog> => {
  const response = await authedFetch(
    `/api/v1/nutrition/logs/${encodeURIComponent(entryId)}?date=${encodeURIComponent(date)}`,
    {
      method: "DELETE",
    },
  );
  return (await response.json()) as DailyNutritionLog;
};

export const regenerateNutritionPlan = async (): Promise<void> => {
  await authedFetch("/api/v1/nutrition/plan/regenerate", {
    method: "POST",
    body: JSON.stringify({}),
  });
};
