import { NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseRouteParams, v } from "@/lib/request-validation";
import { createModerationAction, deleteCommunityLikeAsAdmin } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

const paramsSchema = v.object({
  likeId: v.string({ trim: true, minLength: 1, maxLength: 128 }),
});

export async function DELETE(request: Request, { params }: { params: Promise<{ likeId: string }> }) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "admin-community-likes-delete",
    scope: "write",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const context = await assertAdminAccess(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "admin-community-likes-delete",
      uid: context.uid,
      scope: "write",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const { likeId } = parseRouteParams<{ likeId: string }>(await params, paramsSchema);
    await deleteCommunityLikeAsAdmin(likeId);
    await createModerationAction({
      targetType: "like",
      targetId: likeId,
      action: "delete",
      reason: "Deleted by admin.",
      performedByUid: context.uid,
      performedByEmail: context.email ?? "",
      metadata: { actorRole: context.adminRole },
    });
    return NextResponse.json({
      data: { likeId, deleted: true },
    } satisfies AdminApiResponse<{ likeId: string; deleted: boolean }>);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ data: null, error: error.message } satisfies AdminApiResponse<null>, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to delete like.";
    const status = /forbidden|admin access required/i.test(message) ? 403 : 401;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
