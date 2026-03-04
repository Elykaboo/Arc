"use client";

import { onIdTokenChanged } from "firebase/auth";
import { useEffect } from "react";
import { auth } from "@/lib/firebase";
import { syncSessionCookie } from "@/lib/client-session";

export default function AuthSessionSync() {
  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, (user) => {
      void (async () => {
        const token = user ? await user.getIdToken().catch(() => null) : null;
        await syncSessionCookie(token).catch(() => undefined);
      })();
    });

    return unsubscribe;
  }, []);

  return null;
}
