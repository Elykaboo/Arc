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
        : mode === "offboarding"
          ? `You're signed out, ${safeName}.`
        : null;
  const subtitle =
    mode === "offboarding"
      ? "Your session has ended safely. Come back anytime to continue your training."
      : "Your training space is ready. Syncing your dashboard, planner, and community feed.";

  useEffect(() => {
    if (!message) {
      router.replace("/");
      return;
    }

    const timer = window.setTimeout(() => {
      router.replace("/");
    }, DISPLAY_MS);

    return () => window.clearTimeout(timer);
  }, [message, router]);

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
          <div className="welcome-screen__status">Initializing</div>
        </div>
        <div className="welcome-screen__brandmark" aria-hidden="true">
          <span className="welcome-screen__brand-ring welcome-screen__brand-ring--outer" />
          <span className="welcome-screen__brand-ring welcome-screen__brand-ring--inner" />
          <span className="welcome-screen__brand-core">A</span>
        </div>
        <h1 className="welcome-screen__title">{message}</h1>
        <p className="welcome-screen__subtitle">{subtitle}</p>
        <div className="welcome-screen__highlights" aria-hidden="true">
          <div className="welcome-screen__chip">Profile loaded</div>
          <div className="welcome-screen__chip">Planner synced</div>
          <div className="welcome-screen__chip">Community ready</div>
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
