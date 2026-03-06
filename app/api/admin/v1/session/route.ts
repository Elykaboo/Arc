import { NextResponse } from "next/server";
import { assertAdminAccess } from "@/lib/server-auth";
import { clearAdminSessionCookie, createAdminSessionToken, setAdminSessionCookie } from "@/lib/admin-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = await assertAdminAccess(request);
    const token = createAdminSessionToken({
      uid: context.uid,
      email: context.email ?? "",
      role: context.adminRole ?? "moderator",
    });
    const response = NextResponse.json({
      data: {
        uid: context.uid,
        role: context.adminRole,
      },
    } satisfies AdminApiResponse<{ uid: string; role: string | null }>);
    setAdminSessionCookie(response, token);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create admin session.";
    const status = /forbidden|admin access required/i.test(message) ? 403 : 401;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ data: { cleared: true } } satisfies AdminApiResponse<{ cleared: boolean }>);
  clearAdminSessionCookie(response);
  return response;
}
