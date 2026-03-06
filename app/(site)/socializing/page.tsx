import type { Metadata } from "next";
import CommunityClient from "../community/community-client";

export const metadata: Metadata = {
  title: "Home",
  description: "Connect with other Arc users by sharing milestones and progress updates.",
};

export default function UserSocializingPage() {
  return (
    <CommunityClient
      heading="Home"
      description="Post updates, share progress photos, and celebrate wins with other Arc users."
      showTrainingSidebar
    />
  );
}
