import type { Exercise } from "@/types/workout";

const EXERCISE_TYPES = ["Strength", "Hypertrophy", "Conditioning"] as const;
const API_BASE_URL =
  process.env.EXERCISE_API_BASE_URL ??
  "https://edb-with-videos-and-images-by-ascendapi.p.rapidapi.com";
const API_VERSION = process.env.EXERCISE_API_VERSION ?? "/api/v1";
const API_LIMIT = 100;
const API_MAX_PAGES = 50;
const PUBLIC_FALLBACK_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

const normalize = (value: string) => value.trim().toLowerCase();
const normalizeVersion = (value: string) => (value.startsWith("/") ? value : `/${value}`);

type ApiExercise = {
  id?: number | string;
  name?: string;
  bodyPart?: string;
  category?: string;
  target?: string;
  targetMuscles?: string[];
  secondaryMuscles?: string[];
  primaryMuscles?: string[];
  equipment?: string;
  instructions?: string[] | string;
  description?: string;
};

let cachedExercises: Exercise[] | null = null;
const asText = (value: unknown) => (typeof value === "string" ? value : value ? String(value) : "");

function toExercise(item: ApiExercise): Exercise | null {
  const name = asText(item.name).trim();
  const id = asText(item.id).trim();

  if (!name || !id) return null;

  const primaryMuscles =
    item.primaryMuscles && item.primaryMuscles.length > 0
      ? item.primaryMuscles
      : [
          ...(item.targetMuscles ?? []),
          ...(item.target ? [item.target] : []),
          ...(item.secondaryMuscles ?? []),
        ];

  const dedupedMuscles = [
    ...new Set(primaryMuscles.map((muscle) => asText(muscle).trim()).filter(Boolean)),
  ];

  const instructionText = Array.isArray(item.instructions)
    ? item.instructions.join(" ")
    : item.instructions;

  return {
    id,
    name,
    category: asText(item.category ?? item.bodyPart) || "General",
    primaryMuscles: dedupedMuscles.length > 0 ? dedupedMuscles : ["General"],
    equipment: asText(item.equipment) || "Unknown",
    description:
      item.description ??
      instructionText ??
      `A ${name} variation for ${item.bodyPart?.toLowerCase() ?? "general"} training.`,
  };
}

async function fetchRapidApiExercises() {
  const allRows: ApiExercise[] = [];

  for (let page = 0; page < API_MAX_PAGES; page += 1) {
    const offset = page * API_LIMIT;
    const payload = await requestApi(`/exercises?limit=${API_LIMIT}&offset=${offset}`);
    const rows = readRows(payload);
    if (rows.length === 0) break;

    allRows.push(...rows);
    if (rows.length < API_LIMIT) break;
  }

  return allRows;
}

async function fetchFallbackExercises() {
  const response = await fetch(PUBLIC_FALLBACK_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Fallback exercise source failed (${response.status})`);
  }

  const payload = (await response.json()) as unknown;
  return readRows(payload);
}

async function requestApi(path: string) {
  const baseUrl = API_BASE_URL.replace(/\/$/, "");
  const version = normalizeVersion(API_VERSION);
  const url = `${baseUrl}${version}${path}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (process.env.RAPIDAPI_KEY) {
    headers["x-rapidapi-key"] = process.env.RAPIDAPI_KEY;
  }

  if (process.env.RAPIDAPI_HOST) {
    headers["x-rapidapi-host"] = process.env.RAPIDAPI_HOST;
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Exercise API request failed (${response.status})`);
  }

  return response.json();
}

function readRows(payload: unknown): ApiExercise[] {
  if (Array.isArray(payload)) return payload as ApiExercise[];
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: ApiExercise[] }).data;
  }
  if (
    payload &&
    typeof payload === "object" &&
    "results" in payload &&
    Array.isArray((payload as { results?: unknown }).results)
  ) {
    return (payload as { results: ApiExercise[] }).results;
  }
  return [];
}

async function loadExercises() {
  if (cachedExercises) return cachedExercises;

  let allRows: ApiExercise[] = [];
  let rapidApiError: unknown = null;

  try {
    allRows = await fetchRapidApiExercises();
  } catch (error) {
    rapidApiError = error;
  }

  if (allRows.length === 0) {
    try {
      allRows = await fetchFallbackExercises();
    } catch {
      if (rapidApiError instanceof Error) {
        throw rapidApiError;
      }
      throw new Error("Failed to load exercises from any API source");
    }
  }

  cachedExercises = allRows.map(toExercise).filter((exercise): exercise is Exercise => exercise !== null);
  return cachedExercises;
}

export async function findExerciseById(id: string) {
  const exercises = await loadExercises();
  return exercises.find((exercise) => exercise.id === id);
}

export async function filterExercises(params: {
  search?: string;
  bodypart?: string;
  muscle?: string;
  equipment?: string;
  limit?: number;
}) {
  const exercises = await loadExercises();
  const searchTerm = params.search ? normalize(params.search) : "";
  const bodypart = params.bodypart ? normalize(params.bodypart) : "";
  const muscle = params.muscle ? normalize(params.muscle) : "";
  const equipment = params.equipment ? normalize(params.equipment) : "";

  const filtered = exercises.filter((exercise) => {
    const name = normalize(exercise.name);
    const category = normalize(exercise.category);
    const muscles = exercise.primaryMuscles.map(normalize);
    const exerciseEquipment = normalize(exercise.equipment);

    if (searchTerm && !name.includes(searchTerm)) return false;
    if (bodypart && category !== bodypart) return false;
    if (muscle && !muscles.some((item) => item.includes(muscle))) return false;
    if (equipment && exerciseEquipment !== equipment) return false;

    return true;
  });

  if (!params.limit || Number.isNaN(params.limit) || params.limit <= 0) {
    return filtered;
  }

  return filtered.slice(0, params.limit);
}

export async function getAllMuscles() {
  const exercises = await loadExercises();
  return [...new Set(exercises.flatMap((exercise) => exercise.primaryMuscles))].sort();
}

export async function getAllBodyparts() {
  const exercises = await loadExercises();
  return [...new Set(exercises.map((exercise) => exercise.category))].sort();
}

export async function getAllEquipments() {
  const exercises = await loadExercises();
  return [...new Set(exercises.map((exercise) => exercise.equipment))].sort();
}

export async function getAllExerciseTypes() {
  try {
    const payload = await requestApi("/exercisetypes");
    if (Array.isArray(payload)) {
      return payload.map(String);
    }
    return [...EXERCISE_TYPES];
  } catch {
    return [...EXERCISE_TYPES];
  }
}
