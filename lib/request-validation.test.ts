import assert from "node:assert/strict";
import test from "node:test";
import { InputValidationError, parseQueryParams, parseRouteParams, v } from "@/lib/request-validation";

test("parseQueryParams rejects unexpected fields", () => {
  const request = new Request("https://example.com/api/v1/foods?search=rice&extra=value");
  assert.throws(
    () => parseQueryParams(request, v.object({ search: v.string({ optional: true }) })),
    (error: unknown) => error instanceof InputValidationError && /Unexpected field/.test(error.message),
  );
});

test("parseRouteParams validates string lengths", () => {
  const schema = v.object({ id: v.string({ maxLength: 5 }) });
  assert.throws(
    () => parseRouteParams({ id: "too-long" }, schema),
    (error: unknown) => error instanceof InputValidationError && /at most 5/.test(error.message),
  );
});
