import WorkoutDetailClient from "./workout-detail-client";

type WorkoutDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function WorkoutDetailPage({ params }: WorkoutDetailPageProps) {
  const { id } = await params;
  return <WorkoutDetailClient id={id} />;
}
