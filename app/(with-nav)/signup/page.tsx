import { redirectAuthenticatedUser } from "@/lib/server-route-auth";
import SignupClient from "./signup-client";

export default async function SignupPage() {
  await redirectAuthenticatedUser();
  return <SignupClient />;
}
