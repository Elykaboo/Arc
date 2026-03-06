import { NextResponse } from "next/server";
import { listAdminUsers } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await assertAdminAccess(request);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const limit = Number.parseInt(searchParams.get("limit") ?? "80", 10);
    const users = await listAdminUsers(search, Number.isFinite(limit) ? limit : 80);
    return NextResponse.json({
      data: users,
      meta: { count: users.length },
    } satisfies AdminApiResponse<typeof users>);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch admin users.";
    const status = /forbidden|admin access required/i.test(message) ? 403 : 401;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
