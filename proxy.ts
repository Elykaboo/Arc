import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_SESSION_COOKIE = "arc_admin_session";

const isProtectedPath = (pathname: string): boolean =>
  pathname.startsWith("/admin-console") || pathname.startsWith("/api/admin");

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname === "/api/admin/v1/session") {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json({ data: null, error: "Unauthorized admin session." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/admin-login";
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin-console/:path*", "/api/admin/:path*"],
};
