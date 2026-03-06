import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ADMIN_SESSION_COOKIE = "arc_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 60 * 60; // 1 hour

type AdminSessionPayload = {
  uid: string;
  email: string;
  role: string;
  exp: number;
};

const readSecret = (): string => {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing ADMIN_SESSION_SECRET.");
  }
  return secret;
};

const toBase64Url = (value: string): string => Buffer.from(value, "utf8").toString("base64url");

const fromBase64Url = (value: string): string => Buffer.from(value, "base64url").toString("utf8");

const sign = (rawPayload: string): string => {
  const secret = readSecret();
  return createHmac("sha256", secret).update(rawPayload).digest("base64url");
};

const parseSessionValue = (token: string): AdminSessionPayload | null => {
  const [rawEncoded, signature] = token.split(".");
  if (!rawEncoded || !signature) return null;

  const expected = sign(rawEncoded);
  const left = Buffer.from(signature, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  const raw = fromBase64Url(rawEncoded);
  const payload = JSON.parse(raw) as Partial<AdminSessionPayload>;
  if (
    typeof payload.uid !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.role !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (Date.now() > payload.exp) return null;
  return {
    uid: payload.uid,
    email: payload.email,
    role: payload.role,
    exp: payload.exp,
  };
};

export const createAdminSessionToken = (input: { uid: string; email: string; role: string }): string => {
  const payload: AdminSessionPayload = {
    uid: input.uid.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role.trim(),
    exp: Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000,
  };
  const raw = JSON.stringify(payload);
  const rawEncoded = toBase64Url(raw);
  const signature = sign(rawEncoded);
  return `${rawEncoded}.${signature}`;
};

export const setAdminSessionCookie = (response: NextResponse, token: string): void => {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
};

export const clearAdminSessionCookie = (response: NextResponse): void => {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
};

export const readAdminSessionFromRequestCookie = (cookieValue: string | undefined): AdminSessionPayload | null => {
  if (!cookieValue) return null;
  return parseSessionValue(cookieValue);
};

export const readAdminSessionFromServerCookies = async (): Promise<AdminSessionPayload | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return parseSessionValue(token);
};

export const adminSessionCookieName = ADMIN_SESSION_COOKIE;
