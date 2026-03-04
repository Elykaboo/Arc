import WorkoutDetailClient from "./workout-detail-client";
import { requireProtectedSession } from "@/lib/server-route-auth";

type WorkoutDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function WorkoutDetailPage({ params }: WorkoutDetailPageProps) {
  await requireProtectedSession();
  const { id } = await params;
  return <WorkoutDetailClient id={id} />;
}
