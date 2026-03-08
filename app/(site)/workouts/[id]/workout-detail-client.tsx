"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Exercise } from "@/types/workout";

type WorkoutDetailClientProps = {
  id: string;
};

export default function WorkoutDetailClient({ id }: WorkoutDetailClientProps) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVideoBroken, setIsVideoBroken] = useState(false);
  const [isGifBroken, setIsGifBroken] = useState(false);

  useEffect(() => {
    let isStale = false;

    const loadExercise = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/v1/exercises/${id}`, { cache: "no-store" });

        if (response.status === 404) {
          throw new Error("Exercise not found");
        }

        if (!response.ok) {
          throw new Error("Failed to load exercise");
        }

        const payload = (await response.json()) as Exercise;

        if (!isStale) {
          setExercise(payload);
          setIsVideoBroken(false);
          setIsGifBroken(false);
        }
      } catch (requestError: unknown) {
        void requestError;
        if (!isStale) {
          setError("Exercise not found");
          setExercise(null);
        }
      } finally {
        if (!isStale) {
          setIsLoading(false);
        }
      }
    };

    loadExercise();

    return () => {
      isStale = true;
    };
  }, [id]);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-10">
      <Link href="/workouts" className="text-sm font-medium text-slate-700 underline">
        Back to library
      </Link>

      {isLoading ? <p className="text-sm text-slate-500">Loading exercise...</p> : null}

      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {exercise ? (
        <>
          <header className="space-y-2">
            <h1 className="text-3xl font-bold text-slate-900">{exercise.name}</h1>
            <p className="text-slate-600">Category: {exercise.category}</p>
          </header>

          {exercise.videoUrl?.trim() && !isVideoBroken ? (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <video
                src={exercise.videoUrl}
                className="aspect-video w-full object-cover"
                controls
                playsInline
                onError={() => setIsVideoBroken(true)}
              />
            </section>
          ) : exercise.gifUrl?.trim() && !isGifBroken ? (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={exercise.gifUrl}
                alt={`${exercise.name} form demonstration`}
                className="aspect-video w-full object-cover"
                onError={() => setIsGifBroken(true)}
              />
            </section>
          ) : null}

          <section className="space-y-3 rounded-md border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Primary muscles</h2>
            <p className="text-slate-700">{exercise.primaryMuscles.join(", ")}</p>
            <h2 className="font-semibold">Equipment</h2>
            <p className="text-slate-700">{exercise.equipment}</p>
            <h2 className="font-semibold">Description</h2>
            <p className="text-slate-700">{exercise.description}</p>
          </section>
        </>
      ) : null}
    </main>
  );
}
