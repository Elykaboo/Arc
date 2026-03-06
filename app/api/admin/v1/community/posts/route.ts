import { NextResponse } from "next/server";
import { listCommunityPostsForAdmin } from "@/lib/admin-db";
import { assertAdminAccess } from "@/lib/server-auth";
import type { AdminApiResponse } from "@/types/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await assertAdminAccess(request);
    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get("limit") ?? "60", 10);
    const posts = await listCommunityPostsForAdmin(Number.isFinite(limit) ? limit : 60);
    return NextResponse.json({
      data: posts,
      meta: { count: posts.length },
    } satisfies AdminApiResponse<typeof posts>);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch community posts.";
    const status = /forbidden|admin access required/i.test(message) ? 403 : 401;
    return NextResponse.json({ data: null, error: message } satisfies AdminApiResponse<null>, { status });
  }
}
