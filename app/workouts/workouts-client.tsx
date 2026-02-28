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

const CARD_BATCH_SIZE = 10;

export default function WorkoutsClient() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [bodypart, setBodypart] = useState("all");
  const [muscle, setMuscle] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [visibleCount, setVisibleCount] = useState(CARD_BATCH_SIZE);

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [bodyparts, setBodyparts] = useState<string[]>([]);
  const [muscles, setMuscles] = useState<string[]>([]);
  const [equipments, setEquipments] = useState<string[]>([]);
  const [items, setItems] = useState<Exercise[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const canShowMore = visibleCount < items.length;

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
    setVisibleCount(CARD_BATCH_SIZE);
  }, [items]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.08),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_48%,_#ffffff_100%)]">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
        <header className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-slate-950 px-6 py-8 text-white shadow-[0_30px_80px_-45px_rgba(15,23,42,0.95)] sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(125,211,252,0.24),_transparent_30%),radial-gradient(circle_at_left,_rgba(129,140,248,0.18),_transparent_35%)]" />
          <div className="relative grid gap-6 lg:grid-cols-[1.4fr_0.9fr] lg:items-end">
            <div className="space-y-4">
              <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-slate-200">
                Exercise Library
              </span>
              <div className="space-y-3">
                <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Find the right movement, then build the session around it.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                  Browse live exercise data, filter by body part or equipment, and load more only
                  when you need it.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                  API status
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      status?.status === "ok" ? "bg-emerald-400" : "bg-amber-400"
                    }`}
                  />
                  <span className="text-sm font-medium text-white">
                    {status?.status === "ok" ? "Online" : "Checking"}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                  Visible now
                </p>
                <p className="mt-3 text-3xl font-semibold text-white">{visibleItems.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                  Total matches
                </p>
                <p className="mt-3 text-3xl font-semibold text-white">{items.length}</p>
              </div>
            </div>
          </div>
        </header>

        <section className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)] backdrop-blur">
          <div className="border-b border-slate-200/80 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                  Refine results
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">Dial in your search</h2>
              </div>
              <button
                type="button"
                onClick={resetFilters}
                disabled={!hasActiveFilters}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset filters
              </button>
            </div>
          </div>

          <div className="space-y-5 px-6 py-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium text-slate-800">Search</span>
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search by name"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium text-slate-800">Bodypart</span>
                <select
                  value={bodypart}
                  onChange={(event) => setBodypart(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                >
                  <option value="all">All</option>
                  {bodyparts.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium text-slate-800">Muscle</span>
                <select
                  value={muscle}
                  onChange={(event) => setMuscle(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                >
                  <option value="all">All</option>
                  {muscles.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium text-slate-800">Equipment</span>
                <select
                  value={equipment}
                  onChange={(event) => setEquipment(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                >
                  <option value="all">All</option>
                  {equipments.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-sm text-slate-600">
                Showing <span className="font-semibold text-slate-900">{visibleItems.length}</span> of{" "}
                <span className="font-semibold text-slate-900">{items.length}</span> result
                {items.length === 1 ? "" : "s"}
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {bodypart === "all" ? "Any bodypart" : bodypart}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {muscle === "all" ? "Any muscle" : muscle}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {equipment === "all" ? "Any gear" : equipment}
                </span>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        {isLoading ? (
          <div className="rounded-[2rem] border border-slate-200/80 bg-white/80 px-6 py-12 text-center text-sm text-slate-500 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
            Loading exercises...
          </div>
        ) : (
          <div className="space-y-6">
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleItems.map((exercise) => (
                <li
                  key={exercise.id}
                  className="group relative overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.45)] transition duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_30px_80px_-45px_rgba(15,23,42,0.55)]"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400 opacity-80" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                        {exercise.category}
                      </p>
                      <h2 className="text-lg font-semibold leading-6 text-slate-950">
                        {exercise.name}
                      </h2>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {exercise.equipment}
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    Targets {exercise.primaryMuscles.join(", ")}.
                  </p>
                  <Link
                    href={`/workouts/${exercise.id}`}
                    className="mt-6 inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    View details
                  </Link>
                </li>
              ))}
            </ul>

            {canShowMore ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((current) => current + CARD_BATCH_SIZE)}
                  className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-[0_20px_50px_-30px_rgba(15,23,42,0.85)] transition hover:scale-[1.02] hover:bg-slate-800"
                >
                  See more
                </button>
              </div>
            ) : null}
          </div>
        )}

        {!isLoading && items.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center">
            <p className="text-sm text-slate-500">No exercises found for current filters.</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
