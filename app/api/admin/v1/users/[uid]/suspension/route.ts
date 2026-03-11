import { NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseJsonBody, parseRouteParams, v } from "@/lib/request-validation";
import { createModerationAction, setUserSuspension } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

const paramsSchema = v.object({
  uid: v.string({ trim: true, minLength: 1, maxLength: 128 }),
});

const bodySchema = v.object({
  suspended: v.boolean({ optional: true }),
  reason: v.string({ trim: true, maxLength: 300, optional: true }),
  suspensionEndsAt: v.string({ trim: true, maxLength: 64, optional: true, nullable: true }),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const ipRateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "admin-users-suspension-patch",
    scope: "write",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  try {
    const context = await assertAdminAccess(request);
    const userRateLimitResponse = enforcePublicApiRateLimit(request, {
      feature: "admin-users-suspension-patch",
      uid: context.uid,
      scope: "write",
      skipIp: true,
    });
    if (userRateLimitResponse) return userRateLimitResponse;

    const { uid } = parseRouteParams<{ uid: string }>(await params, paramsSchema);
    const body = await parseJsonBody<{
      suspended?: boolean;
      reason?: string;
      suspensionEndsAt?: string | null;
    }>(request, bodySchema);
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
    if (error instanceof InputValidationError) {
      return NextResponse.json({ data: null, error: error.message } satisfies AdminApiResponse<null>, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to update suspension.";
    const status = /forbidden|admin access required/i.test(message)
      ? 403
      : /token|bearer|unauthorized/i.test(message)
        ? 401
        : 500;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
