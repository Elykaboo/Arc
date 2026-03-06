import { NextResponse } from "next/server";
import { deleteUserAccountAsAdmin } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

const readReason = async (request: Request): Promise<string> => {
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

export async function DELETE(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const context = await assertAdminAccess(request);
    const { uid } = await params;
    const reason = await readReason(request);

    const result = await deleteUserAccountAsAdmin({
      targetUid: uid,
      actorUid: context.uid,
      actorRole: context.adminRole,
      reason,
      performedByEmail: context.email ?? "",
    });

    return NextResponse.json({
      data: { uid, deleted: true },
      meta: result,
    } satisfies AdminApiResponse<{ uid: string; deleted: boolean }>);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete user account.";
    const status = /required|invalid/i.test(message)
      ? 400
      : /forbidden|admin access required/i.test(message)
        ? 403
        : /not found/i.test(message)
          ? 404
          : /token|bearer|unauthorized/i.test(message)
            ? 401
            : 500;

    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
