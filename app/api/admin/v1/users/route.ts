import { NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseQueryParams, v } from "@/lib/request-validation";
import { listAdminUsers } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

const querySchema = v.object({
  search: v.string({ trim: true, maxLength: 120, optional: true }),
  limit: v.number({ integer: true, min: 1, max: 200, coerce: true, optional: true }),
});

export async function GET(request: Request) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "admin-users-get",
    scope: "read",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const context = await assertAdminAccess(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "admin-users-get",
      uid: context.uid,
      scope: "read",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const query = parseQueryParams<{ search?: string; limit?: number }>(request, querySchema);
    const users = await listAdminUsers(query.search ?? "", query.limit ?? 80);
    return NextResponse.json({
      data: users,
      meta: { count: users.length },
    } satisfies AdminApiResponse<typeof users>);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ data: null, error: error.message } satisfies AdminApiResponse<null>, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to fetch admin users.";
    const status = /forbidden|admin access required/i.test(message) ? 403 : 401;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
