import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/server-session";

const cookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60,
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string | null };
    const token = body.token?.trim();

    if (!token) {
      return NextResponse.json({ message: "Missing session token." }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, token, cookieOptions);
    return response;
  } catch {
    return NextResponse.json({ message: "Invalid session payload." }, { status: 400 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...cookieOptions,
    maxAge: 0,
  });
  return response;
}
