import { getAdminDb } from "@/lib/firebase-admin";

type RateLimitScope = "minute" | "day";

export type RateLimitCheck = {
  allowed: boolean;
  scope: RateLimitScope;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type StoredLimitState = {
  dayKey: string;
  dayCount: number;
  windowStartMs: number;
  windowCount: number;
};

type EnforceRateLimitParams = {
  uid: string;
  feature: string;
  perMinuteLimit: number;
  perDayLimit: number;
};

const WINDOW_MS = 60_000;
const memoryState = new Map<string, StoredLimitState>();

const dateKeyFromMs = (value: number) => new Date(value).toISOString().slice(0, 10);

const nextDayStartMs = (value: number) => {
  const nextDay = new Date(value);
  nextDay.setUTCHours(24, 0, 0, 0);
  return nextDay.getTime();
};

const ensureState = (state: StoredLimitState | null | undefined, nowMs: number): StoredLimitState => {
  const dayKey = dateKeyFromMs(nowMs);
  if (!state || state.dayKey !== dayKey) {
    return {
      dayKey,
      dayCount: 0,
      windowStartMs: nowMs,
      windowCount: 0,
    };
  }

  if (nowMs - state.windowStartMs >= WINDOW_MS) {
    return {
      ...state,
      windowStartMs: nowMs,
      windowCount: 0,
    };
  }

  return state;
};

const buildBlockedResult = (
  scope: RateLimitScope,
  limit: number,
  remaining: number,
  resetAt: number,
  nowMs: number,
): RateLimitCheck => ({
  allowed: false,
  scope,
  limit,
  remaining: Math.max(0, remaining),
  resetAt,
  retryAfterSeconds: Math.max(1, Math.ceil((resetAt - nowMs) / 1000)),
});

const applyRateLimit = (
  previousState: StoredLimitState | null | undefined,
  nowMs: number,
  perMinuteLimit: number,
  perDayLimit: number,
): { state: StoredLimitState; result: RateLimitCheck } => {
  const state = ensureState(previousState, nowMs);
  const dayResetAt = nextDayStartMs(nowMs);
  const minuteResetAt = state.windowStartMs + WINDOW_MS;

  if (state.dayCount >= perDayLimit) {
    return {
      state,
      result: buildBlockedResult("day", perDayLimit, 0, dayResetAt, nowMs),
    };
  }

  if (state.windowCount >= perMinuteLimit) {
    return {
      state,
      result: buildBlockedResult("minute", perMinuteLimit, 0, minuteResetAt, nowMs),
    };
  }

  const nextState: StoredLimitState = {
    ...state,
    dayCount: state.dayCount + 1,
    windowCount: state.windowCount + 1,
  };

  return {
    state: nextState,
    result: {
      allowed: true,
      scope: "minute",
      limit: perMinuteLimit,
      remaining: Math.max(0, perMinuteLimit - nextState.windowCount),
      resetAt: minuteResetAt,
      retryAfterSeconds: 0,
    },
  };
};

const withMemoryRateLimit = (params: EnforceRateLimitParams): RateLimitCheck => {
  const key = `${params.feature}:${params.uid}`;
  const nowMs = Date.now();
  const current = memoryState.get(key);
  const { state, result } = applyRateLimit(current, nowMs, params.perMinuteLimit, params.perDayLimit);
  memoryState.set(key, state);
  return result;
};

export const enforceUserRateLimit = async (params: EnforceRateLimitParams): Promise<RateLimitCheck> => {
  const key = `${params.feature}:${params.uid}`;
  const nowMs = Date.now();
  const dayKey = dateKeyFromMs(nowMs);

  try {
    const db = await getAdminDb();
    const ref = db.collection("aiRateLimits").doc(`${key}:${dayKey}`);
    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const stored = snapshot.exists ? (snapshot.data() as Partial<StoredLimitState>) : null;
      const currentState: StoredLimitState | null =
        stored && typeof stored.dayKey === "string"
          ? {
              dayKey: stored.dayKey,
              dayCount: typeof stored.dayCount === "number" ? stored.dayCount : 0,
              windowStartMs: typeof stored.windowStartMs === "number" ? stored.windowStartMs : nowMs,
              windowCount: typeof stored.windowCount === "number" ? stored.windowCount : 0,
            }
          : null;

      const next = applyRateLimit(currentState, nowMs, params.perMinuteLimit, params.perDayLimit);
      transaction.set(
        ref,
        {
          ...next.state,
          feature: params.feature,
          uid: params.uid,
          updatedAt: new Date(nowMs),
          expiresAt: new Date(nextDayStartMs(nowMs) + 2 * 24 * 60 * 60 * 1000),
        },
        { merge: true },
      );
      return next.result;
    });
    return result;
  } catch (error) {
    console.error("Falling back to in-memory rate limiter", error);
    return withMemoryRateLimit(params);
  }
};
