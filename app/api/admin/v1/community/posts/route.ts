import { NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseQueryParams, v } from "@/lib/request-validation";
import { listCommunityPostsForAdmin } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

const querySchema = v.object({
  limit: v.number({ integer: true, min: 1, max: 200, coerce: true, optional: true }),
});

export async function GET(request: Request) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "admin-community-posts-get",
    scope: "read",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const context = await assertAdminAccess(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "admin-community-posts-get",
      uid: context.uid,
      scope: "read",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const query = parseQueryParams<{ limit?: number }>(request, querySchema);
    const posts = await listCommunityPostsForAdmin(query.limit ?? 60);
    return NextResponse.json({
      data: posts,
      meta: { count: posts.length },
    } satisfies AdminApiResponse<typeof posts>);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ data: null, error: error.message } satisfies AdminApiResponse<null>, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to fetch community posts.";
    const status = /forbidden|admin access required/i.test(message) ? 403 : 401;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
