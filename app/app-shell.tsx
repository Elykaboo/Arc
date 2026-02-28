"use client";

import { onAuthStateChanged } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
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
      if (user && !user.emailVerified && pathname !== "/verify-email") {
        router.replace(verificationRoute(user));
        return;
      }

      if (!user && pathname === "/verify-email") {
        router.replace("/login");
        return;
      }

      setCanRenderChildren(true);
      setIsReady(true);
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
  const showSiteNav = pathname !== "/welcome" && pathname !== "/verify-email";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {showSiteNav ? <SiteNav /> : null}
      <main className="min-w-0">
        <AuthGate key={pathname}>{children}</AuthGate>
      </main>
    </div>
  );
}
