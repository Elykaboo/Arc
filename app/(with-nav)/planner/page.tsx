import PlannerClient from "./planner-client";
import { requireProtectedSession } from "@/lib/server-route-auth";

export default async function PlannerPage() {
  await requireProtectedSession();
  return <PlannerClient />;
}
