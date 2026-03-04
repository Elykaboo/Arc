import PageTransitionShell from "@/app/page-transition-shell";

export default function NoNavLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <PageTransitionShell>{children}</PageTransitionShell>
    </div>
  );
}
