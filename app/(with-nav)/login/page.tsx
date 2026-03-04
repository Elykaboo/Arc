import { redirectAuthenticatedUser } from "@/lib/server-route-auth";
import LoginClient from "./login-client";

export default async function LoginPage() {
  await redirectAuthenticatedUser();
  return <LoginClient />;
}
