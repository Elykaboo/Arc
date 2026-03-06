"use client";

import { onAuthStateChanged } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { loadUserProfile } from "@/lib/profile-db";
import { isNutritionProfileComplete } from "@/lib/nutrition-profile";
import SiteNav from "./site-nav";

type AppShellProps = {
  children: React.ReactNode;
};

const verificationRoute = (user: { email: string | null; displayName: string | null }) => {
  const params = new URLSearchParams({
    email: user.email || "",
    name: user.displayName?.trim() || user.email?.split("@")[0]?.trim() || "Athlete",
  });
  return `/verify-email?${params.toString()}`;
};

function AuthGate({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [canRenderChildren, setCanRenderChildren] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      void (async () => {
        if (user && !user.emailVerified && pathname !== "/verify-email") {
          router.replace(verificationRoute(user));
          return;
        }

        if (!user && pathname === "/verify-email") {
          router.replace("/login");
          return;
        }

        if (user?.emailVerified) {
          const profile = await loadUserProfile(user.uid).catch(() => null);
          const isComplete = profile ? isNutritionProfileComplete(profile) : false;
          const isAllowedPreOnboarding =
            pathname === "/onboarding" ||
            pathname === "/verify-email" ||
            pathname === "/login" ||
            pathname === "/signup";

          if (!isComplete && !isAllowedPreOnboarding) {
            router.replace("/onboarding");
            return;
          }

          if (isComplete && pathname === "/onboarding") {
            router.replace("/socializing");
            return;
          }
        }

        setCanRenderChildren(true);
        setIsReady(true);
      })();
    });

    return unsubscribe;
  }, [pathname, router]);

  if (!isReady || !canRenderChildren) {
    return null;
  }

  return <>{children}</>;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const showSiteNav = pathname !== "/welcome" && pathname !== "/verify-email" && pathname !== "/onboarding";
  const [transitionVisible, setTransitionVisible] = useState(false);
  const [contentPhase, setContentPhase] = useState<"idle" | "entering">("idle");
  const hideTransitionTimeoutRef = useRef<number | null>(null);
  const enterTransitionTimeoutRef = useRef<number | null>(null);
  const transitionFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash === window.location.hash) return;
        setTransitionVisible(true);
      } catch {
        // Ignore invalid URLs and let navigation proceed normally.
      }
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, []);

  useEffect(() => {
    if (hideTransitionTimeoutRef.current !== null) {
      window.clearTimeout(hideTransitionTimeoutRef.current);
    }
    if (enterTransitionTimeoutRef.current !== null) {
      window.clearTimeout(enterTransitionTimeoutRef.current);
    }
    if (transitionFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionFrameRef.current);
    }

    transitionFrameRef.current = window.requestAnimationFrame(() => {
      setTransitionVisible(true);
      setContentPhase("entering");
    });

    hideTransitionTimeoutRef.current = window.setTimeout(() => {
      setTransitionVisible(false);
    }, 260);

    enterTransitionTimeoutRef.current = window.setTimeout(() => {
      setContentPhase("idle");
    }, 360);

    return () => {
      if (hideTransitionTimeoutRef.current !== null) {
        window.clearTimeout(hideTransitionTimeoutRef.current);
      }
      if (enterTransitionTimeoutRef.current !== null) {
        window.clearTimeout(enterTransitionTimeoutRef.current);
      }
      if (transitionFrameRef.current !== null) {
        window.cancelAnimationFrame(transitionFrameRef.current);
      }
    };
  }, [pathname]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {showSiteNav ? <SiteNav /> : null}
      <div
        aria-hidden="true"
        className={`page-transition-overlay ${transitionVisible ? "page-transition-overlay--visible" : ""}`}
      />
      <main className="min-w-0">
        <div className={`page-transition-content ${contentPhase === "entering" ? "page-transition-content--entering" : ""}`}>
          <AuthGate key={pathname}>{children}</AuthGate>
        </div>
      </main>
    </div>
  );
}
