import RoutinesClient from "./routines-client";
import { requireProtectedSession } from "@/lib/server-route-auth";

export default async function RoutinesPage() {
  await requireProtectedSession();
  return <RoutinesClient />;
}
