import { NextResponse } from "next/server";
import { createModerationAction, setCommunityPostHiddenState } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const context = await assertAdminAccess(request);
    const { postId } = await params;
    const body = (await request.json()) as { hidden?: boolean; reason?: string };
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
    const message = error instanceof Error ? error.message : "Unable to update post visibility.";
    const status = /forbidden|admin access required/i.test(message) ? 403 : 401;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
