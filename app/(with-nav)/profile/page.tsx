import ProfileClient from "./profile-client";
import { requireProtectedSession } from "@/lib/server-route-auth";

export default async function ProfilePage() {
  await requireProtectedSession();
  return <ProfileClient />;
}
