import assert from "node:assert/strict";
import test from "node:test";
import { __test_resetPublicRateLimitState, enforcePublicApiRateLimit } from "@/lib/public-rate-limit";

test("blocks repeated IP requests when ipPerMinute is reached", async () => {
  __test_resetPublicRateLimitState();
  const request = new Request("https://example.com/api/v1/foods", {
    headers: {
      "x-forwarded-for": "203.0.113.10",
    },
  });

  const first = enforcePublicApiRateLimit(request, {
    feature: "test-ip-limit",
    scope: "read",
    ipPerMinute: 1,
  });
  assert.equal(first, null);

  const second = enforcePublicApiRateLimit(request, {
    feature: "test-ip-limit",
    scope: "read",
    ipPerMinute: 1,
  });
  assert.ok(second);
  assert.equal(second.status, 429);
  assert.equal(second.headers.get("Retry-After"), "60");

  const body = (await second.json()) as {
    error: string;
    rateLimit: { subject: string };
  };
  assert.equal(body.error, "rate_limited");
  assert.equal(body.rateLimit.subject, "ip");
});

test("blocks repeated user requests when userPerMinute is reached", async () => {
  __test_resetPublicRateLimitState();
  const request = new Request("https://example.com/api/v1/nutrition/dashboard", {
    headers: {
      "x-forwarded-for": "203.0.113.11",
    },
  });

  const first = enforcePublicApiRateLimit(request, {
    feature: "test-user-limit",
    uid: "user-1",
    scope: "read",
    userPerMinute: 1,
    skipIp: true,
  });
  assert.equal(first, null);

  const second = enforcePublicApiRateLimit(request, {
    feature: "test-user-limit",
    uid: "user-1",
    scope: "read",
    userPerMinute: 1,
    skipIp: true,
  });
  assert.ok(second);
  assert.equal(second.status, 429);

  const body = (await second.json()) as {
    error: string;
    rateLimit: { subject: string };
  };
  assert.equal(body.error, "rate_limited");
  assert.equal(body.rateLimit.subject, "user");
});
