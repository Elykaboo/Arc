"use client";

export const syncSessionCookie = async (token: string | null) => {
  const method = token ? "POST" : "DELETE";
  const body = token ? JSON.stringify({ token }) : undefined;

  await fetch("/api/auth/session", {
    method,
    body,
    headers: token ? { "Content-Type": "application/json" } : undefined,
    credentials: "same-origin",
  });
};
