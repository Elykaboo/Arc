import { NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseRouteParams, v } from "@/lib/request-validation";
import { getAdminUserByUid } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

const paramsSchema = v.object({
  uid: v.string({ trim: true, minLength: 1, maxLength: 128 }),
});

export async function GET(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "admin-users-by-uid-get",
    scope: "read",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const context = await assertAdminAccess(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "admin-users-by-uid-get",
      uid: context.uid,
      scope: "read",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const { uid } = parseRouteParams<{ uid: string }>(await params, paramsSchema);
    const user = await getAdminUserByUid(uid);
    if (!user) {
      return NextResponse.json({ data: null, error: "User not found." } satisfies AdminApiResponse<null>, {
        status: 404,
      });
    }
    return NextResponse.json({ data: user } satisfies AdminApiResponse<typeof user>);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ data: null, error: error.message } satisfies AdminApiResponse<null>, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to fetch user.";
    const status = /forbidden|admin access required/i.test(message) ? 403 : 401;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
