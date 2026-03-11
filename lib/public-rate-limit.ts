import { NextResponse } from "next/server";

type RateLimitScope = "read" | "write" | "expensive";
type RateLimitSubject = "ip" | "user";

type RateLimitState = {
  windowStartMs: number;
  windowCount: number;
};

type RateLimitCheck = {
  allowed: boolean;
  subject: RateLimitSubject;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type EnforcePublicRateLimitParams = {
  feature: string;
  uid?: string | null;
  scope?: RateLimitScope;
  ipPerMinute?: number;
  userPerMinute?: number;
  skipIp?: boolean;
  skipUser?: boolean;
};

const WINDOW_MS = 60_000;
const rateLimitState = new Map<string, RateLimitState>();

const RATE_LIMIT_DEFAULTS: Record<RateLimitScope, { ip: number; user: number }> = {
  read: { ip: 120, user: 240 },
  write: { ip: 60, user: 120 },
  expensive: { ip: 20, user: 40 },
};

const parsePositiveInt = (value: string | undefined): number | null => {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const resolveDefaultLimit = (scope: RateLimitScope, subject: RateLimitSubject): number => {
  const scopePrefix = scope.toUpperCase();
  const subjectSuffix = subject === "ip" ? "IP" : "USER";

  const scopedOverride = parsePositiveInt(process.env[`API_RATE_LIMIT_${scopePrefix}_${subjectSuffix}_PER_MINUTE`]);
  if (scopedOverride) return scopedOverride;

  const globalOverride = parsePositiveInt(process.env[`API_RATE_LIMIT_${subjectSuffix}_PER_MINUTE`]);
  if (globalOverride) return globalOverride;

  return RATE_LIMIT_DEFAULTS[scope][subject];
};

const getRequestIp = (request: Request): string => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp) return cfConnectingIp;

  return "unknown";
};

const consumeRateLimit = (key: string, subject: RateLimitSubject, limit: number): RateLimitCheck => {
  const nowMs = Date.now();
  const current = rateLimitState.get(key);
  const activeState =
    !current || nowMs - current.windowStartMs >= WINDOW_MS
      ? {
          windowStartMs: nowMs,
          windowCount: 0,
        }
      : current;

  if (activeState.windowCount >= limit) {
    const resetAt = activeState.windowStartMs + WINDOW_MS;
    return {
      allowed: false,
      subject,
      limit,
      remaining: 0,
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - nowMs) / 1000)),
    };
  }

  const nextState: RateLimitState = {
    ...activeState,
    windowCount: activeState.windowCount + 1,
  };
  rateLimitState.set(key, nextState);

  return {
    allowed: true,
    subject,
    limit,
    remaining: Math.max(0, limit - nextState.windowCount),
    resetAt: nextState.windowStartMs + WINDOW_MS,
    retryAfterSeconds: 0,
  };
};

const createRateLimitResponse = (feature: string, scope: RateLimitScope, check: RateLimitCheck): NextResponse =>
  NextResponse.json(
    {
      message: "Too many requests. Please retry shortly.",
      error: "rate_limited",
      rateLimit: {
        feature,
        scope,
        subject: check.subject,
        limit: check.limit,
        remaining: check.remaining,
        resetAt: check.resetAt,
        retryAfterSeconds: check.retryAfterSeconds,
      },
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(check.retryAfterSeconds),
        "X-RateLimit-Limit": String(check.limit),
        "X-RateLimit-Remaining": String(check.remaining),
        "X-RateLimit-Reset": String(check.resetAt),
      },
    },
  );

export const enforcePublicApiRateLimit = (
  request: Request,
  params: EnforcePublicRateLimitParams,
): NextResponse | null => {
  const scope = params.scope ?? "read";

  if (!params.skipIp) {
    const ipLimit = params.ipPerMinute ?? resolveDefaultLimit(scope, "ip");
    const ipAddress = getRequestIp(request);
    const ipResult = consumeRateLimit(`ip:${params.feature}:${ipAddress}`, "ip", ipLimit);
    if (!ipResult.allowed) {
      return createRateLimitResponse(params.feature, scope, ipResult);
    }
  }

  const uid = params.uid?.trim() ?? "";
  if (!params.skipUser && uid) {
    const userLimit = params.userPerMinute ?? resolveDefaultLimit(scope, "user");
    const userResult = consumeRateLimit(`user:${params.feature}:${uid}`, "user", userLimit);
    if (!userResult.allowed) {
      return createRateLimitResponse(params.feature, scope, userResult);
    }
  }

  return null;
};

export const __test_resetPublicRateLimitState = () => {
  rateLimitState.clear();
};
