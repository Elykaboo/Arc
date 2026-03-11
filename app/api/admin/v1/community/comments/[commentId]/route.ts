import { NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseRouteParams, v } from "@/lib/request-validation";
import { createModerationAction, deleteCommunityCommentAsAdmin } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

const paramsSchema = v.object({
  commentId: v.string({ trim: true, minLength: 1, maxLength: 128 }),
});

export async function DELETE(request: Request, { params }: { params: Promise<{ commentId: string }> }) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "admin-community-comments-delete",
    scope: "write",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const context = await assertAdminAccess(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "admin-community-comments-delete",
      uid: context.uid,
      scope: "write",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const { commentId } = parseRouteParams<{ commentId: string }>(await params, paramsSchema);
    await deleteCommunityCommentAsAdmin(commentId);
    await createModerationAction({
      targetType: "comment",
      targetId: commentId,
      action: "delete",
      reason: "Deleted by admin.",
      performedByUid: context.uid,
      performedByEmail: context.email ?? "",
      metadata: { actorRole: context.adminRole },
    });
    return NextResponse.json({
      data: { commentId, deleted: true },
    } satisfies AdminApiResponse<{ commentId: string; deleted: boolean }>);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ data: null, error: error.message } satisfies AdminApiResponse<null>, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to delete comment.";
    const status = /forbidden|admin access required/i.test(message) ? 403 : 401;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
