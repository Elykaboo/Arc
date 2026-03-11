import { NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseJsonBody, parseRouteParams, v } from "@/lib/request-validation";
import { createModerationAction, setCommunityPostHiddenState } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

const paramsSchema = v.object({
  postId: v.string({ trim: true, minLength: 1, maxLength: 128 }),
});

const bodySchema = v.object({
  hidden: v.boolean({ optional: true }),
  reason: v.string({ trim: true, maxLength: 300, optional: true }),
});

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "admin-community-posts-hide-post",
    scope: "write",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const context = await assertAdminAccess(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "admin-community-posts-hide-post",
      uid: context.uid,
      scope: "write",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const { postId } = parseRouteParams<{ postId: string }>(await params, paramsSchema);
    const body = await parseJsonBody<{ hidden?: boolean; reason?: string }>(request, bodySchema);
    const hidden = body.hidden !== false;
    const reason = typeof body.reason === "string" ? body.reason : "";

    await setCommunityPostHiddenState({
      postId,
      hidden,
      reason,
      actorUid: context.uid,
    });

    await createModerationAction({
      targetType: "post",
      targetId: postId,
      action: hidden ? "hide" : "unhide",
      reason,
      performedByUid: context.uid,
      performedByEmail: context.email ?? "",
      metadata: { actorRole: context.adminRole },
    });

    return NextResponse.json({
      data: { postId, hidden },
    } satisfies AdminApiResponse<{ postId: string; hidden: boolean }>);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ data: null, error: error.message } satisfies AdminApiResponse<null>, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to update post visibility.";
    const status = /forbidden|admin access required/i.test(message) ? 403 : 401;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
