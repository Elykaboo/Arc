import type { Metadata } from "next";
import "../globals.css";
import ArcSplashLoader from "./arc-splash-loader";
import AppShell from "./app-shell";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Arc Workout Planner",
    template: "%s | Arc",
  },
  description:
    "Arc helps you plan workouts, build routines, and organize a complete weekly training plan in one place.",
  keywords: [
    "workout planner",
    "gym planner",
    "training plan",
    "fitness routine builder",
    "weekly workout schedule",
    "strength training planner",
  ],
  category: "fitness",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Arc Workout Planner",
    description:
      "Plan workouts, build routines, and organize your week with Arc.",
    url: "/",
    siteName: "Arc",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Arc Workout Planner",
    description:
      "Build a practical weekly gym plan with workouts, routines, and scheduling tools.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var storedTheme = localStorage.getItem("theme");
                var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                var isDark = storedTheme ? storedTheme === "dark" : prefersDark;
                document.documentElement.classList.toggle("dark", isDark);
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <ArcSplashLoader />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
