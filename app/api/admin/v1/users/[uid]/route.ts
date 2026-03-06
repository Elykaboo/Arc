import { NextResponse } from "next/server";
import { getAdminUserByUid } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  try {
    await assertAdminAccess(request);
    const { uid } = await params;
    const user = await getAdminUserByUid(uid);
    if (!user) {
      return NextResponse.json({ data: null, error: "User not found." } satisfies AdminApiResponse<null>, {
        status: 404,
      });
    }
    return NextResponse.json({ data: user } satisfies AdminApiResponse<typeof user>);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch user.";
    const status = /forbidden|admin access required/i.test(message) ? 403 : 401;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
