import type { Metadata } from "next";
import CommunityDirectoryClient from "./community-directory-client";
import { loadCommunityDirectoryInitialData } from "@/lib/server-community-directory";
import { requireProtectedSession } from "@/lib/server-route-auth";

export const metadata: Metadata = {
  title: "Community",
  description: "Browse all visible Arc users and open their profiles.",
};

export default async function CommunityPage() {
  await requireProtectedSession();
  const initialData = await loadCommunityDirectoryInitialData().catch(() => null);
  return <CommunityDirectoryClient initialData={initialData} />;
}
