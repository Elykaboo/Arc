import { redirect } from "next/navigation";
import { getServerSession, type ServerSession } from "@/lib/server-session";

const buildVerificationRoute = (session: NonNullable<ServerSession>) => {
  const params = new URLSearchParams({
    email: session.email || "",
    name: session.displayName?.trim() || session.email?.split("@")[0]?.trim() || "Athlete",
    mode: "returning",
  });

  return `/verify-email?${params.toString()}`;
};

export const requireProtectedSession = async (): Promise<NonNullable<ServerSession>> => {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if (!session.emailVerified) {
    redirect(buildVerificationRoute(session));
  }

  if (!session.onboardingComplete) {
    redirect("/onboarding");
  }

  return session;
};

export const requireOnboardingSession = async (): Promise<NonNullable<ServerSession>> => {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if (!session.emailVerified) {
    redirect(buildVerificationRoute(session));
  }

  if (session.onboardingComplete) {
    redirect("/nutrition");
  }

  return session;
};

export const redirectAuthenticatedUser = async () => {
  const session = await getServerSession();

  if (!session) {
    return;
  }

  if (!session.emailVerified) {
    redirect(buildVerificationRoute(session));
  }

  if (!session.onboardingComplete) {
    redirect("/onboarding");
  }

  const resolvedName = session.displayName?.trim() || session.email?.split("@")[0]?.trim() || "Athlete";
  redirect(`/welcome?mode=returning&name=${encodeURIComponent(resolvedName)}`);
};

export const requireVerifyEmailSession = async (): Promise<NonNullable<ServerSession>> => {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if (session.emailVerified) {
    if (session.onboardingComplete) {
      const resolvedName = session.displayName?.trim() || session.email?.split("@")[0]?.trim() || "Athlete";
      redirect(`/welcome?mode=returning&name=${encodeURIComponent(resolvedName)}`);
    }

    redirect("/onboarding");
  }

  return session;
};
