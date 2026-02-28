"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, reload, sendEmailVerification, signOut, type User } from "firebase/auth";
import { initializeVerifiedUserProfile } from "@/lib/auth-profile";
import { auth } from "@/lib/firebase";

const resolveDisplayName = (user: Pick<User, "displayName" | "email">) =>
  user.displayName?.trim() || user.email?.split("@")[0]?.trim() || "Athlete";

const buildWelcomeRoute = (user: Pick<User, "displayName" | "email">, mode: "new" | "returning") => {
  const params = new URLSearchParams({
    mode,
    name: resolveDisplayName(user),
  });
  return `/welcome?${params.toString()}`;
};

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isChecking, setIsChecking] = useState(true);
  const [isResending, setIsResending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mode = searchParams.get("mode") === "new" ? "new" : "returning";
  const emailHint = searchParams.get("email")?.trim() || "";

  const completeVerifiedSignIn = useCallback(async (user: User) => {
    try {
      await user.getIdToken(true);
    } catch {
      // Keep moving even if token refresh is temporarily unavailable.
    }

    try {
      await initializeVerifiedUserProfile(user);
    } catch (err) {
      console.error("Verified user profile initialization failed.", err);
    }

    router.replace(buildWelcomeRoute(user, mode));
  }, [mode, router]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      setMessage(null);
      setError(null);

      if (user.emailVerified) {
        void (async () => {
          await completeVerifiedSignIn(user);
        })();
        return;
      }

      setIsChecking(false);
    });

    return unsubscribe;
  }, [router, mode, completeVerifiedSignIn]);

  const handleResend = async () => {
    setError(null);
    setMessage(null);
    setIsResending(true);

    try {
      if (!auth.currentUser) {
        router.replace("/login");
        return;
      }

      await sendEmailVerification(auth.currentUser);
      setMessage("Verification email sent. Check your inbox and spam folder.");
    } catch (err) {
      if (err instanceof FirebaseError && err.code === "auth/too-many-requests") {
        setError("Too many verification emails were requested. Wait a bit, then try again.");
      } else {
        setError("Unable to send verification email right now. Try again shortly.");
      }
    } finally {
      setIsResending(false);
    }
  };

  const handleRefresh = async () => {
    setError(null);
    setMessage(null);
    setIsRefreshing(true);

    try {
      if (!auth.currentUser) {
        router.replace("/login");
        return;
      }

      await reload(auth.currentUser);

      if (!auth.currentUser.emailVerified) {
        setMessage("Your email is not verified yet. Open the email link, then try again.");
        return;
      }

      await completeVerifiedSignIn(auth.currentUser);
    } catch {
      setError("Unable to refresh your verification status right now. Try again.");
    } finally {
      setIsRefreshing(false);
      setIsChecking(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  if (isChecking) {
    return null;
  }

  return (
    <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center px-6 py-10">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Verify Email
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Check your inbox
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          We sent a verification link to{" "}
          <span className="font-semibold text-slate-900">{auth.currentUser?.email || emailHint || "your email"}</span>.
          You need to verify it before entering Arc.
        </p>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isRefreshing ? "Checking..." : "I verified my email"}
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            className="w-full rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isResending ? "Sending..." : "Resend verification email"}
          </button>
        </div>

        {message ? (
          <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-between text-sm text-slate-600">
          <Link href="/login" className="font-semibold text-slate-900 underline-offset-4 hover:underline">
            Back to login
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="font-semibold text-slate-900 underline-offset-4 hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </section>
  );
}
