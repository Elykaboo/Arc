import { NextResponse } from "next/server";
import { createModerationAction, deleteCommunityPostAsAdmin } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

const readReasonFromDeleteRequest = async (request: Request): Promise<string> => {
  const { searchParams } = new URL(request.url);
  const queryReason = searchParams.get("reason")?.trim();
  if (queryReason) return queryReason;

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return "";
  }

  try {
    const body = (await request.json()) as { reason?: string };
    return typeof body.reason === "string" ? body.reason.trim() : "";
  } catch {
    return "";
  }
};

export async function DELETE(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const context = await assertAdminAccess(request);
    const { postId } = await params;
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
    const message = error instanceof Error ? error.message : "Unable to delete post.";
    const status = /forbidden|admin access required/i.test(message)
      ? 403
      : /not found/i.test(message)
        ? 404
        : 500;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
