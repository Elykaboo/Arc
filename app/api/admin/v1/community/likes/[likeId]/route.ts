import { NextResponse } from "next/server";
import { createModerationAction, deleteCommunityLikeAsAdmin } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ likeId: string }> }) {
  try {
    const context = await assertAdminAccess(request);
    const { likeId } = await params;
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
    const message = error instanceof Error ? error.message : "Unable to delete like.";
    const status = /forbidden|admin access required/i.test(message) ? 403 : 401;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
