"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) return;

      if (user.emailVerified) {
        router.replace("/socializing");
        return;
      }

      const params = new URLSearchParams({
        email: user.email || "",
        mode: "returning",
        name: user.displayName?.trim() || user.email?.split("@")[0]?.trim() || "Athlete",
      });
      router.replace(`/verify-email?${params.toString()}`);
    });

    return unsubscribe;
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const resolvedUsername =
        credential.user.displayName?.trim() ||
        credential.user.email?.split("@")[0]?.trim() ||
        "Athlete";

      if (!credential.user.emailVerified) {
        const params = new URLSearchParams({
          email: credential.user.email || email.trim(),
          mode: "returning",
          name: resolvedUsername,
        });
        router.replace(`/verify-email?${params.toString()}`);
        return;
      }

      router.push(`/welcome?mode=returning&name=${encodeURIComponent(resolvedUsername)}`);
    } catch {
      setError("Unable to log in. Check your email/password and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center px-6 py-10">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Welcome Back
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Login
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to manage your workouts, routines, and weekly planner.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="mb-1 block text-sm font-semibold text-slate-700"
            >
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label
                htmlFor="login-password"
                className="block text-sm font-semibold text-slate-700"
              >
                Password
              </label>
              <Link
                href="#"
                className="text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
              placeholder="Enter your password"
            />
          </div>

          {error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {isSubmitting ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-semibold text-slate-900 underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </section>
  );
}
