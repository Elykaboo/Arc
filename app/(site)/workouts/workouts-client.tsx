"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Exercise } from "@/types/workout";

type ExerciseResponse = {
  total: number;
  items: Exercise[];
};

type StatusResponse = {
  status: string;
  service: string;
  timestamp: string;
};

const PAGE_SIZE = 12;

export default function WorkoutsClient() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [bodypart, setBodypart] = useState("all");
  const [muscle, setMuscle] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [page, setPage] = useState(1);
  const [featuredExerciseId, setFeaturedExerciseId] = useState("");

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [bodyparts, setBodyparts] = useState<string[]>([]);
  const [muscles, setMuscles] = useState<string[]>([]);
  const [equipments, setEquipments] = useState<string[]>([]);
  const [items, setItems] = useState<Exercise[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brokenVideoByExerciseId, setBrokenVideoByExerciseId] = useState<Record<string, boolean>>({});
  const [brokenGifByExerciseId, setBrokenGifByExerciseId] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const loadMeta = async () => {
      const [statusResult, bodypartsResult, musclesResult, equipmentsResult] = await Promise.allSettled([
        fetch("/api/v1/liveness", { cache: "no-store" }),
        fetch("/api/v1/bodyparts", { cache: "no-store" }),
        fetch("/api/v1/muscles", { cache: "no-store" }),
        fetch("/api/v1/equipments", { cache: "no-store" }),
      ]);

      if (statusResult.status === "fulfilled" && statusResult.value.ok) {
        const statusData = (await statusResult.value.json()) as StatusResponse;
        setStatus(statusData);
      }

      if (bodypartsResult.status === "fulfilled" && bodypartsResult.value.ok) {
        const bodypartsData = (await bodypartsResult.value.json()) as string[];
        setBodyparts(bodypartsData);
      } else {
        setBodyparts([]);
      }

      if (musclesResult.status === "fulfilled" && musclesResult.value.ok) {
        const musclesData = (await musclesResult.value.json()) as string[];
        setMuscles(musclesData);
      } else {
        setMuscles([]);
      }

      if (equipmentsResult.status === "fulfilled" && equipmentsResult.value.ok) {
        const equipmentsData = (await equipmentsResult.value.json()) as string[];
        setEquipments(equipmentsData);
      } else {
        setEquipments([]);
      }
    };

    loadMeta().catch(() => {
      setBodyparts([]);
      setMuscles([]);
      setEquipments([]);
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [searchInput]);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();

    if (search.trim()) params.set("search", search.trim());
    if (bodypart !== "all") params.set("bodypart", bodypart);
    if (muscle !== "all") params.set("muscle", muscle);
    if (equipment !== "all") params.set("equipment", equipment);

    const queryString = params.toString();
    return `/api/v1/exercises/search${queryString ? `?${queryString}` : ""}`;
  }, [search, bodypart, muscle, equipment]);

  const hasActiveFilters =
    Boolean(search.trim()) || bodypart !== "all" || muscle !== "all" || equipment !== "all";

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return items.slice(startIndex, startIndex + PAGE_SIZE);
  }, [items, currentPage]);

  const resetFilters = () => {
    setSearchInput("");
    setSearch("");
    setBodypart("all");
    setMuscle("all");
    setEquipment("all");
  };

  useEffect(() => {
    let isStale = false;

    const loadExercises = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(queryUrl, { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Failed to load exercises");
        }

        const data = (await response.json()) as ExerciseResponse;

        if (!isStale) {
          setItems(data.items);
        }
      } catch (requestError: unknown) {
        void requestError;
        if (!isStale) {
          setError("Unable to load exercises right now. Please try again.");
          setItems([]);
        }
      } finally {
        if (!isStale) {
          setIsLoading(false);
        }
      }
    };

    loadExercises();

    return () => {
      isStale = true;
    };
  }, [queryUrl]);

  useEffect(() => {
    setPage(1);
  }, [items]);

  useEffect(() => {
    const nextFeaturedId = pageItems[0]?.id ?? "";
    setFeaturedExerciseId((current) => {
      if (current && items.some((item) => item.id === current)) return current;
      return nextFeaturedId;
    });
  }, [items, pageItems]);

  const featuredExercise = useMemo(
    () => items.find((item) => item.id === featuredExerciseId) ?? pageItems[0] ?? null,
    [items, featuredExerciseId, pageItems],
  );

  const canShowVideo = (exercise: Exercise | null): boolean => {
    if (!exercise) return false;
    return Boolean(exercise.videoUrl?.trim()) && !brokenVideoByExerciseId[exercise.id];
  };

  const canShowGif = (exercise: Exercise | null): boolean => {
    if (!exercise) return false;
    return Boolean(exercise.gifUrl?.trim()) && !brokenGifByExerciseId[exercise.id];
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <header className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-500">Workout Form Library</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">Find proper form like a video feed</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Search exercises, filter quickly, and review API-provided form media for each movement.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-20 lg:h-fit">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Filters</p>
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Search
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="e.g. squat form"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Bodypart
                <select
                  value={bodypart}
                  onChange={(event) => setBodypart(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">All</option>
                  {bodyparts.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Muscle
                <select
                  value={muscle}
                  onChange={(event) => setMuscle(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">All</option>
                  {muscles.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Equipment
                <select
                  value={equipment}
                  onChange={(event) => setEquipment(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">All</option>
                  {equipments.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={resetFilters}
                disabled={!hasActiveFilters}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Reset filters
              </button>
            </div>
          </aside>

          <section className="space-y-4">
            {featuredExercise ? (
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="aspect-video bg-[linear-gradient(135deg,#111827,#1e293b,#7f1d1d)]">
                    {canShowVideo(featuredExercise) ? (
                      <video
                        src={featuredExercise.videoUrl}
                        className="h-full w-full object-cover"
                        muted
                        loop
                        autoPlay
                        playsInline
                        controls
                        onError={() =>
                          setBrokenVideoByExerciseId((current) => ({
                            ...current,
                            [featuredExercise.id]: true,
                          }))
                        }
                      />
                    ) : canShowGif(featuredExercise) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={featuredExercise.gifUrl}
                        alt={`${featuredExercise.name} demonstration`}
                        className="h-full w-full object-cover"
                        onError={() =>
                          setBrokenGifByExerciseId((current) => ({
                            ...current,
                            [featuredExercise.id]: true,
                          }))
                        }
                      />
                    ) : null}
                  </div>
                  <div className="space-y-2 bg-slate-950 p-5 text-white">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-200">Featured Form Guide</p>
                    <h2 className="text-2xl font-bold">{featuredExercise.name}</h2>
                    <p className="text-sm text-slate-200">
                      Focus: {featuredExercise.primaryMuscles.join(", ") || "General"} · {featuredExercise.equipment || "Bodyweight"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link
                        href={`/workouts/${featuredExercise.id}`}
                        className="rounded-lg border border-white/35 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                      >
                        Exercise details
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {isLoading ? "Loading..." : `${items.length} exercises found`} · Page {currentPage} of {totalPages}
                </p>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {status?.status === "ok" ? "API online" : "API checking"}
                </p>
              </div>

              {error ? (
                <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                  {error}
                </p>
              ) : null}

              {isLoading ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                  Loading exercises...
                </p>
              ) : items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                  No exercises found for the selected filters.
                </p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {pageItems.map((exercise) => (
                    <li key={exercise.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-slate-600">
                      <button
                        type="button"
                        onClick={() => setFeaturedExerciseId(exercise.id)}
                        className="mb-2 flex aspect-video w-full items-end rounded-lg bg-[linear-gradient(140deg,#0f172a,#1d4ed8,#7c2d12)] p-2 text-left"
                      >
                        {canShowVideo(exercise) ? (
                          <video
                            src={exercise.videoUrl}
                            className="h-full w-full rounded-lg object-cover"
                            muted
                            loop
                            autoPlay
                            playsInline
                            onError={() =>
                              setBrokenVideoByExerciseId((current) => ({
                                ...current,
                                [exercise.id]: true,
                              }))
                            }
                          />
                        ) : canShowGif(exercise) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={exercise.gifUrl}
                            alt={`${exercise.name} exercise gif`}
                            className="h-full w-full rounded-lg object-cover"
                            onError={() =>
                              setBrokenGifByExerciseId((current) => ({
                                ...current,
                                [exercise.id]: true,
                              }))
                            }
                          />
                        ) : (
                          <span className="rounded bg-black/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-100">
                            {exercise.category}
                          </span>
                        )}
                      </button>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{exercise.name}</h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                        {exercise.primaryMuscles.join(", ")} · {exercise.equipment || "Bodyweight"}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <Link
                          href={`/workouts/${exercise.id}`}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Details
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {!isLoading && items.length > 0 ? (
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={currentPage <= 1}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={currentPage >= totalPages}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
