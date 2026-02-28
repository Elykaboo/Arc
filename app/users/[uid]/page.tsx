import UserProfileClient from "./user-profile-client";

type UserProfilePageProps = {
  params: Promise<{ uid: string }>;
};

export default async function UserProfilePage({ params }: UserProfilePageProps) {
  const { uid } = await params;
  return <UserProfileClient uid={uid} />;
}
