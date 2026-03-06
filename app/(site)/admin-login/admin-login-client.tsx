"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "@/lib/firebase";

type Status = "idle" | "checking-auth" | "creating-session" | "ready" | "error";

export default function AdminLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("Preparing admin login...");

  const nextPath = useMemo(() => {
    const nextValue = searchParams.get("next")?.trim();
    if (!nextValue || !nextValue.startsWith("/")) return "/admin-console";
    return nextValue;
  }, [searchParams]);

  useEffect(() => {
    setStatus("checking-auth");
    setMessage("Checking Firebase login...");

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setStatus("error");
        setMessage("You are not signed in. Please log in with a Firebase account first.");
        return;
      }

      setStatus("creating-session");
      setMessage("Verifying admin access...");

      try {
        const idToken = await user.getIdToken();
        const response = await fetch("/api/admin/v1/session", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Admin access denied.");
        }
        setStatus("ready");
        setMessage("Admin session established. Redirecting...");
        router.replace(nextPath);
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Unable to establish admin session.");
      }
    });

    return () => unsubscribe();
  }, [nextPath, router]);

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Arc Admin Login</h1>
      <p className="mt-4 text-sm text-zinc-500">{message}</p>
      {status === "error" ? (
        <a
          className="mt-8 rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-700"
          href="/login"
        >
          Go To Login
        </a>
      ) : null}
    </main>
  );
}
