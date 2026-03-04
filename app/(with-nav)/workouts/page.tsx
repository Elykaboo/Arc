import WorkoutsClient from "./workouts-client";
import { filterExercises, getAllBodyparts, getAllEquipments, getAllMuscles } from "@/lib/exercises";
import { requireProtectedSession } from "@/lib/server-route-auth";

type WorkoutsPageProps = {
  searchParams?: Promise<{
    search?: string;
    bodypart?: string;
    muscle?: string;
    equipment?: string;
  }>;
};

export default async function WorkoutsPage({ searchParams }: WorkoutsPageProps) {
  await requireProtectedSession();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialSearch = resolvedSearchParams.search?.trim() || "";
  const initialBodypart = resolvedSearchParams.bodypart?.trim() || "all";
  const initialMuscle = resolvedSearchParams.muscle?.trim() || "all";
  const initialEquipment = resolvedSearchParams.equipment?.trim() || "all";

  const [bodyparts, muscles, equipments, items] = await Promise.all([
    getAllBodyparts().catch(() => []),
    getAllMuscles().catch(() => []),
    getAllEquipments().catch(() => []),
    filterExercises({
      search: initialSearch || undefined,
      bodypart: initialBodypart !== "all" ? initialBodypart : undefined,
      muscle: initialMuscle !== "all" ? initialMuscle : undefined,
      equipment: initialEquipment !== "all" ? initialEquipment : undefined,
    }).catch(() => []),
  ]);

  return (
    <WorkoutsClient
      initialSearch={initialSearch}
      initialBodypart={initialBodypart}
      initialMuscle={initialMuscle}
      initialEquipment={initialEquipment}
      initialStatus={{
        status: "ok",
        service: "arc-api",
        timestamp: new Date().toISOString(),
      }}
      initialBodyparts={bodyparts}
      initialMuscles={muscles}
      initialEquipments={equipments}
      initialItems={items}
    />
  );
}
