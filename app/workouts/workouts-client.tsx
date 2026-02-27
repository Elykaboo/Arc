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

export default function WorkoutsClient() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [bodypart, setBodypart] = useState("all");
  const [muscle, setMuscle] = useState("all");
  const [equipment, setEquipment] = useState("all");

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
          throw new Error(`Request failed with status ${response.status}`);
        }

        const data = (await response.json()) as ExerciseResponse;

        if (!isStale) {
          setItems(data.items);
        }
      } catch (requestError: unknown) {
        if (!isStale) {
          const message =
            requestError instanceof Error ? requestError.message : "Failed to load exercises";
          setError(message);
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

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold text-slate-900">Exercise Library</h1>
        <p className="text-slate-600">
          Live API demo: status, filters, and exercise detail pages are all wired to
          ` /api/v1/* ` endpoints.
        </p>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-sm">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              status?.status === "ok" ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          <span className="font-medium text-slate-800">
            API {status?.status === "ok" ? "Online" : "Checking"}
          </span>
        </div>
      </header>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm text-slate-700">
            Search
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by name"
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            />
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            Bodypart
            <select
              value={bodypart}
              onChange={(event) => setBodypart(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none ring-slate-300 focus:ring"
            >
              <option value="all">All</option>
              {bodyparts.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            Muscle
            <select
              value={muscle}
              onChange={(event) => setMuscle(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none ring-slate-300 focus:ring"
            >
              <option value="all">All</option>
              {muscles.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            Equipment
            <select
              value={equipment}
              onChange={(event) => setEquipment(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none ring-slate-300 focus:ring"
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-sm">
          <p className="text-slate-600">
            Showing <span className="font-semibold text-slate-900">{items.length}</span> result
            {items.length === 1 ? "" : "s"}
          </p>
          <button
            type="button"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset filters
          </button>
        </div>
      </section>

      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading exercises...</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((exercise) => (
            <li key={exercise.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="font-semibold text-slate-900">{exercise.name}</h2>
              <p className="text-sm text-slate-600">{exercise.category}</p>
              <p className="mt-2 text-sm text-slate-500">
                {exercise.primaryMuscles.join(", ")} - {exercise.equipment}
              </p>
              <Link
                href={`/workouts/${exercise.id}`}
                className="mt-3 inline-block text-sm font-medium text-slate-900 underline"
              >
                View details
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && items.length === 0 ? (
        <p className="text-sm text-slate-500">No exercises found for current filters.</p>
      ) : null}
    </main>
  );
}
