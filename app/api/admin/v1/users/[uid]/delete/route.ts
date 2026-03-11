import { NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseJsonBody, parseRouteParams, v } from "@/lib/request-validation";
import { deleteUserAccountAsAdmin } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

const paramsSchema = v.object({
  uid: v.string({ trim: true, minLength: 1, maxLength: 128 }),
});

const reasonBodySchema = v.object({
  reason: v.string({ trim: true, maxLength: 300, optional: true }),
});

const readReason = async (request: Request): Promise<string> => {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return "";
  }
  const body = await parseJsonBody<{ reason?: string }>(request, reasonBodySchema);
  return body.reason ?? "";
};

export async function DELETE(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "admin-users-delete",
    scope: "write",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const context = await assertAdminAccess(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "admin-users-delete",
      uid: context.uid,
      scope: "write",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const { uid } = parseRouteParams<{ uid: string }>(await params, paramsSchema);
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
    if (error instanceof InputValidationError) {
      return NextResponse.json({ data: null, error: error.message } satisfies AdminApiResponse<null>, { status: 400 });
    }
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
