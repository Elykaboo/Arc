"use client";

import { auth } from "@/lib/firebase";

export const getAuthHeaders = async (): Promise<HeadersInit> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please log in first.");
  }

  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
};
