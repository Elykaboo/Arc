import { NextResponse } from "next/server";
import { createModerationAction, deleteCommunityCommentAsAdmin } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ commentId: string }> }) {
  try {
    const context = await assertAdminAccess(request);
    const { commentId } = await params;
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
    const message = error instanceof Error ? error.message : "Unable to delete comment.";
    const status = /forbidden|admin access required/i.test(message) ? 403 : 401;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
