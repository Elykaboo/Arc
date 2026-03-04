"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  updateProfile,
} from "firebase/auth";
import { syncSessionCookie } from "@/lib/client-session";
import { auth } from "@/lib/firebase";

export default function SignupPage() {
  const router = useRouter();
  const isCreatingAccountRef = useRef(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !isCreatingAccountRef.current) {
        if (user.emailVerified) {
          router.replace("/socializing");
          return;
        }

        const params = new URLSearchParams({
          email: user.email || "",
          mode: "new",
          name: user.displayName?.trim() || user.email?.split("@")[0]?.trim() || "Athlete",
        });
        router.replace(`/verify-email?${params.toString()}`);
      }
    });
    return unsubscribe;
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    isCreatingAccountRef.current = true;

    try {
      const normalizedUsername = username.trim();
      const normalizedEmail = email.trim();
      if (!normalizedUsername) {
        setError("Username is required.");
        setIsSubmitting(false);
        return;
      }

      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      await updateProfile(credential.user, { displayName: normalizedUsername });
      await sendEmailVerification(credential.user);
      const token = await credential.user.getIdToken().catch(() => null);
      if (token) {
        await syncSessionCookie(token).catch(() => undefined);
      }

      const params = new URLSearchParams({
        email: normalizedEmail,
        mode: "new",
        name: normalizedUsername,
      });
      router.replace(`/verify-email?${params.toString()}`);
    } catch (err) {
      isCreatingAccountRef.current = false;
      if (err instanceof FirebaseError) {
        if (err.code === "auth/email-already-in-use") {
          setError("That email is already registered. Try logging in instead.");
        } else if (err.code === "auth/invalid-email") {
          setError("Please enter a valid email address.");
        } else if (err.code === "auth/weak-password") {
          setError("Password should be at least 6 characters.");
        } else if (err.code === "auth/too-many-requests") {
          setError("Too many attempts. Wait a bit, then try again.");
        } else {
          setError("Unable to create account. Please verify your details and try again.");
        }
      } else {
        setError("Unable to create account. Please verify your details and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center px-6 py-10">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Join Arc
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Sign Up
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Create your account, verify your email, and then start building your training plan.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="signup-username"
              className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              Username
            </label>
            <input
              id="signup-username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="janeathlete"
            />
          </div>

          <div>
            <label
              htmlFor="signup-email"
              className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              Email
            </label>
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="signup-password"
              className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              Password
            </label>
            <input
              id="signup-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Create a strong password"
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
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-300">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-slate-900 underline-offset-4 hover:underline dark:text-slate-100"
          >
            Login
          </Link>
        </p>
      </div>
    </section>
  );
}
