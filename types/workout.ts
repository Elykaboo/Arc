export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type Exercise = {
  id: string;
  name: string;
  category: string;
  primaryMuscles: string[];
  equipment: string;
  description: string;
};

export type PlannedExercise = {
  id: string;
  exerciseId: string;
  sets: number;
  reps: string;
  notes: string;
};

export type WeeklyPlan = Record<Weekday, PlannedExercise[]>;

export type RoutineTemplate = {
  id: string;
  name: string;
  createdAt: string;
  plan: WeeklyPlan;
};
