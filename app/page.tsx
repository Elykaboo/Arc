import type { Metadata } from "next";
import CommunityClient from "@/app/community/community-client";

export const metadata: Metadata = {
  title: "Home",
  description:
    "Connect with other Arc users by sharing milestones, progress updates, and training wins.",
  keywords: [
    "fitness community",
    "training social feed",
    "workout progress sharing",
    "gym community app",
    "fitness milestones",
    "social fitness platform",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Arc Socializing",
    description:
      "Post updates, share progress photos, and stay connected with the Arc community.",
    url: "/",
    siteName: "Arc",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Arc Socializing",
    description:
      "Share training progress and connect with other Arc users.",
  },
};

export default function Home() {
  return (
    <CommunityClient
      heading="Home"
      description="Post updates, share progress photos, and celebrate wins with other Arc users."
      showTrainingSidebar
    />
  );
}
