import type { Metadata } from "next";
import CommunityDirectoryClient from "./community-directory-client";

export const metadata: Metadata = {
  title: "Community",
  description: "Browse all visible Arc users and open their profiles.",
};

export default function CommunityPage() {
  return <CommunityDirectoryClient />;
}
