"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const DISPLAY_MS = 2000;

function WelcomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const name = searchParams.get("name")?.trim() || "";
  const safeName = name || "Athlete";
  const message =
    mode === "new"
      ? `Welcome to Arc, ${safeName}!`
      : mode === "returning"
        ? `Welcome back ${safeName}!`
        : mode === "signed-out"
          ? `You are logged out, ${safeName}.`
        : null;
  const subtitle =
    mode === "signed-out"
      ? "Your session has ended safely. Come back any time to continue planning and sharing progress."
      : "Your training space is ready. Syncing your dashboard, planner, and community feed.";

  useEffect(() => {
    if (!message) {
      router.replace("/");
      return;
    }

    const destination = mode === "signed-out" ? "/" : "/socializing";
    const timer = window.setTimeout(() => {
      router.replace(destination);
    }, DISPLAY_MS);

    return () => window.clearTimeout(timer);
  }, [message, mode, router]);

  if (!message) {
    return null;
  }

  return (
    <section className="welcome-screen">
      <div className="welcome-screen__backdrop" aria-hidden="true" />
      <div className="welcome-screen__grid" aria-hidden="true" />
      <div className="welcome-screen__orb welcome-screen__orb--one" aria-hidden="true" />
      <div className="welcome-screen__orb welcome-screen__orb--two" aria-hidden="true" />
      <div className="welcome-screen__orb welcome-screen__orb--three" aria-hidden="true" />
      <div className="welcome-screen__panel">
        <div className="welcome-screen__topline">
          <p className="welcome-screen__eyebrow">Arc Training Club</p>
          <div className="welcome-screen__status">{mode === "signed-out" ? "Signing out" : "Initializing"}</div>
        </div>
        <div className="welcome-screen__brandmark" aria-hidden="true">
          <span className="welcome-screen__brand-ring welcome-screen__brand-ring--outer" />
          <span className="welcome-screen__brand-ring welcome-screen__brand-ring--inner" />
          <span className="welcome-screen__brand-core">A</span>
        </div>
        <h1 className="welcome-screen__title">{message}</h1>
        <p className="welcome-screen__subtitle">{subtitle}</p>
        <div className="welcome-screen__highlights" aria-hidden="true">
          <div className="welcome-screen__chip">{mode === "signed-out" ? "Session cleared" : "Profile loaded"}</div>
          <div className="welcome-screen__chip">{mode === "signed-out" ? "Data preserved" : "Planner synced"}</div>
          <div className="welcome-screen__chip">{mode === "signed-out" ? "Ready to return" : "Community ready"}</div>
        </div>
        <div className="welcome-screen__meter-shell">
          <div className="welcome-screen__meter" aria-hidden="true">
            <span className="welcome-screen__meter-fill" />
          </div>
          <div className="welcome-screen__meter-glow" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomePageContent />
    </Suspense>
  );
}
