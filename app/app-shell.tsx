"use client";

import SiteNav from "./site-nav";

type AppShellProps = {
  children: React.ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <SiteNav />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
