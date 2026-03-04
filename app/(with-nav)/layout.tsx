import PageTransitionShell from "@/app/page-transition-shell";
import SiteNav from "@/app/site-nav";

export default function WithNavLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <SiteNav />
      <PageTransitionShell>{children}</PageTransitionShell>
    </div>
  );
}
