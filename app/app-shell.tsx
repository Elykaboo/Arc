"use client";

import { usePathname } from "next/navigation";
import SiteNav from "./site-nav";

type AppShellProps = {
  children: React.ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const showSiteNav = pathname !== "/welcome";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {showSiteNav ? <SiteNav /> : null}
      <main className="min-w-0">{children}</main>
    </div>
  );
}
