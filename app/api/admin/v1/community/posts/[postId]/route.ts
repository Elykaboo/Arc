import { NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseJsonBody, parseQueryParams, parseRouteParams, v } from "@/lib/request-validation";
import { createModerationAction, deleteCommunityPostAsAdmin } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

const paramsSchema = v.object({
  postId: v.string({ trim: true, minLength: 1, maxLength: 128 }),
});

const querySchema = v.object({
  reason: v.string({ trim: true, maxLength: 300, optional: true }),
});

const reasonBodySchema = v.object({
  reason: v.string({ trim: true, maxLength: 300, optional: true }),
});

const readReasonFromDeleteRequest = async (request: Request): Promise<string> => {
  const query = parseQueryParams<{ reason?: string }>(request, querySchema);
  const queryReason = query.reason;
  if (queryReason) return queryReason;

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return "";
  }

  const body = await parseJsonBody<{ reason?: string }>(request, reasonBodySchema);
  return body.reason ?? "";
};

export async function DELETE(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "admin-community-posts-delete",
    scope: "write",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const context = await assertAdminAccess(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "admin-community-posts-delete",
      uid: context.uid,
      scope: "write",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const { postId } = parseRouteParams<{ postId: string }>(await params, paramsSchema);
    const reason = await readReasonFromDeleteRequest(request);
    const deleted = await deleteCommunityPostAsAdmin(postId);

    await createModerationAction({
      targetType: "post",
      targetId: postId,
      action: "delete",
      reason: reason || "Hard deleted by admin.",
      performedByUid: context.uid,
      performedByEmail: context.email ?? "",
      metadata: {
        actorRole: context.adminRole,
        postDeleted: deleted.postDeleted,
        commentsDeleted: deleted.commentsDeleted,
        likesDeleted: deleted.likesDeleted,
      },
    });
    return NextResponse.json({
      data: { postId, deleted: true },
      meta: {
        postDeleted: deleted.postDeleted,
        commentsDeleted: deleted.commentsDeleted,
        likesDeleted: deleted.likesDeleted,
      },
    } satisfies AdminApiResponse<{ postId: string; deleted: boolean }>);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ data: null, error: error.message } satisfies AdminApiResponse<null>, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to delete post.";
    const status = /forbidden|admin access required/i.test(message)
      ? 403
      : /not found/i.test(message)
        ? 404
        : 500;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
