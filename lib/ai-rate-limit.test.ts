import test from "node:test";
import assert from "node:assert/strict";
import { __test_applyRateLimit } from "@/lib/ai-rate-limit";

test("rate limiter blocks minute window when limit reached", () => {
  const nowMs = Date.UTC(2026, 2, 9, 0, 0, 0);
  const first = __test_applyRateLimit(null, nowMs, 1, 5);
  assert.equal(first.result.allowed, true);

  const second = __test_applyRateLimit(first.state, nowMs + 10_000, 1, 5);
  assert.equal(second.result.allowed, false);
  assert.equal(second.result.scope, "minute");
});

test("rate limiter blocks day window when limit reached", () => {
  const nowMs = Date.UTC(2026, 2, 9, 0, 0, 0);
  const first = __test_applyRateLimit(null, nowMs, 10, 1);
  assert.equal(first.result.allowed, true);

  const second = __test_applyRateLimit(first.state, nowMs + 61_000, 10, 1);
  assert.equal(second.result.allowed, false);
  assert.equal(second.result.scope, "day");
});
