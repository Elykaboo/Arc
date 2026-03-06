import { NextResponse } from "next/server";
import { listModerationActions } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await assertAdminAccess(request);
    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get("limit") ?? "120", 10);
    const actions = await listModerationActions(Number.isFinite(limit) ? limit : 120);
    return NextResponse.json({
      data: actions,
      meta: { count: actions.length },
    } satisfies AdminApiResponse<typeof actions>);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list audit actions.";
    const status = /forbidden|admin access required/i.test(message) ? 403 : 401;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
