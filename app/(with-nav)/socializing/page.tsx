import type { Metadata } from "next";
import CommunityClient from "@/app/(with-nav)/community/community-client";
import { loadCommunityDirectoryInitialData } from "@/lib/server-community-directory";
import { requireProtectedSession } from "@/lib/server-route-auth";

export const metadata: Metadata = {
  title: "Home",
  description: "Connect with other Arc users by sharing milestones and progress updates.",
};

export default async function UserSocializingPage() {
  await requireProtectedSession();
  const initialData = await loadCommunityDirectoryInitialData().catch(() => null);

  return (
    <CommunityClient
      heading="Home"
      description="Post updates, share progress photos, and celebrate wins with other Arc users."
      showTrainingSidebar
      initialPosts={initialData?.communityPosts || []}
      initialMemberProfiles={initialData?.memberProfiles || []}
    />
  );
}
