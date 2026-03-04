import { requireVerifyEmailSession } from "@/lib/server-route-auth";
import VerifyEmailClient from "./verify-email-client";

export default async function VerifyEmailPage() {
  await requireVerifyEmailSession();
  return <VerifyEmailClient />;
}
