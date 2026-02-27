import type { Metadata } from "next";
import "./globals.css";
import SiteNav from "./site-nav";

export const metadata: Metadata = {
  title: "TheMind2Muscle Workout Planner",
  description: "Plan workouts, build routines, and export your weekly plan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-slate-50">
            <SiteNav />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
