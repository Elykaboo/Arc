import { getAdminAuth } from "@/lib/firebase-admin";

const readBearerToken = (request: Request): string | null => {
  const authorization = request.headers.get("authorization")?.trim() || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token || null;
};

export const getAuthenticatedUid = async (request: Request): Promise<string> => {
  const token = readBearerToken(request);
  if (!token) {
    throw new Error("Missing bearer token.");
  }

  const auth = await getAdminAuth();
  const decoded = await auth.verifyIdToken(token);
  return decoded.uid;
};
