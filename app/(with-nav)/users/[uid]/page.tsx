import UserProfileClient from "./user-profile-client";
import { requireProtectedSession } from "@/lib/server-route-auth";

type UserProfilePageProps = {
  params: Promise<{ uid: string }>;
};

export default async function UserProfilePage({ params }: UserProfilePageProps) {
  await requireProtectedSession();
  const { uid } = await params;
  return <UserProfileClient uid={uid} />;
}
