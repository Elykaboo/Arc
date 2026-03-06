import { NextResponse } from "next/server";
import { createModerationAction, setUserSuspension } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const context = await assertAdminAccess(request);
    const { uid } = await params;
    const body = (await request.json()) as {
      suspended?: boolean;
      reason?: string;
      suspensionEndsAt?: string | null;
    };
    const suspended = body.suspended === true;
    const reason = typeof body.reason === "string" ? body.reason : "";
    const suspensionEndsAt = typeof body.suspensionEndsAt === "string" ? body.suspensionEndsAt : null;

    const updated = await setUserSuspension({
      uid,
      suspended,
      reason,
      suspensionEndsAt,
      actorUid: context.uid,
    });

    if (!updated) {
      return NextResponse.json({ data: null, error: "User not found." } satisfies AdminApiResponse<null>, {
        status: 404,
      });
    }

    await createModerationAction({
      targetType: "user",
      targetId: uid,
      action: suspended ? "suspend" : "unsuspend",
      reason,
      performedByUid: context.uid,
      performedByEmail: context.email ?? "",
      metadata: {
        suspensionEndsAt,
        actorRole: context.adminRole,
      },
    });

    return NextResponse.json({
      data: updated,
      meta: { actorUid: context.uid },
    } satisfies AdminApiResponse<typeof updated>);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update suspension.";
    const status = /forbidden|admin access required/i.test(message)
      ? 403
      : /token|bearer|unauthorized/i.test(message)
        ? 401
        : 500;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
