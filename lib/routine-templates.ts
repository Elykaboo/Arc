export type Weekday =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export type TemplateItem = {
  label: string;
  exerciseName?: string;
  sets: number;
  reps: string;
};

export type RoutineTemplate = {
  id: string;
  name: string;
  daysPerWeek: number;
  level: "Beginner" | "Intermediate" | "Advanced";
  summary: string;
  schedule: Record<Weekday, TemplateItem[]>;
};

export type PlannerWorkoutItem = {
  id: string;
  exerciseId: string;
  sets: number;
  reps: string;
  templateLabel?: string;
  preferredExerciseName?: string;
};

export type PlannerDayPlan = {
  items: PlannerWorkoutItem[];
};

export type PlannerDraft = Record<Weekday, PlannerDayPlan>;

export const weekdays: Weekday[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const plannerStorageKey = "weeklyPlanDraft";

const createItemId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const ex = (label: string, exerciseName: string, sets = 3, reps = "8-12"): TemplateItem => ({
  label,
  exerciseName,
  sets,
  reps,
});
const rest = [] as TemplateItem[];

const getDefaultExerciseName = (label: string): string => {
  const text = label.toLowerCase();

  if (text.includes("full body a")) return "Barbell Squat";
  if (text.includes("full body b")) return "Barbell Bench Press";
  if (text.includes("full body c")) return "Barbell Deadlift";
  if (text.includes("push")) return "Barbell Bench Press";
  if (text.includes("pull")) return "Barbell Bent Over Row";
  if (text.includes("legs")) return "Barbell Squat";
  if (text.includes("upper power")) return "Barbell Bench Press";
  if (text.includes("lower power")) return "Barbell Squat";
  if (text.includes("upper hypertrophy")) return "Incline Dumbbell Press";
  if (text.includes("lower hypertrophy")) return "Romanian Deadlift";
  if (text.includes("upper")) return "Barbell Bench Press";
  if (text.includes("lower")) return "Barbell Squat";
  if (text.includes("chest + back")) return "Barbell Bench Press";
  if (text.includes("shoulders + arms")) return "Dumbbell Shoulder Press";
  if (text.includes("chest")) return "Barbell Bench Press";
  if (text.includes("back")) return "Lat Pulldown";
  if (text.includes("shoulders")) return "Barbell Overhead Press";
  if (text.includes("arms")) return "Barbell Curl";
  if (text.includes("torso")) return "Barbell Bench Press";
  if (text.includes("limbs")) return "Barbell Curl";

  return "Barbell Bench Press";
};

export const routineTemplates: RoutineTemplate[] = [
  {
    id: "full-body-3",
    name: "Full Body (3-Day)",
    daysPerWeek: 3,
    level: "Beginner",
    summary: "Simple and effective when training 3x per week.",
    schedule: {
      Monday: [
        ex("Full Body A", "Barbell Back Squat", 4, "5-8"),
        ex("Full Body A", "Barbell Bench Press", 4, "5-8"),
        ex("Full Body A", "Bent Over Barbell Row", 3, "6-10"),
        ex("Full Body A", "Dumbbell Walking Lunge", 3, "10-12"),
        ex("Full Body A", "Plank", 3, "45-60 sec"),
      ],
      Tuesday: rest,
      Wednesday: [
        ex("Full Body B", "Barbell Deadlift", 3, "3-5"),
        ex("Full Body B", "Overhead Press", 4, "5-8"),
        ex("Full Body B", "Pull-Up", 3, "6-10"),
        ex("Full Body B", "Leg Press", 3, "10-12"),
        ex("Full Body B", "Hanging Leg Raise", 3, "10-15"),
      ],
      Thursday: rest,
      Friday: [
        ex("Full Body C", "Front Squat", 4, "6-8"),
        ex("Full Body C", "Incline Dumbbell Press", 3, "8-12"),
        ex("Full Body C", "Lat Pulldown", 3, "8-12"),
        ex("Full Body C", "Romanian Deadlift", 3, "8-12"),
        ex("Full Body C", "Cable Crunch", 3, "12-15"),
      ],
      Saturday: rest,
      Sunday: rest,
    },
  },
  {
    id: "upper-lower-4",
    name: "Upper / Lower (4-Day)",
    daysPerWeek: 4,
    level: "Beginner",
    summary: "Popular default split for balanced strength and hypertrophy.",
    schedule: {
      Monday: [
        ex("Upper Body", "Barbell Bench Press", 4, "5-8"),
        ex("Upper Body", "Bent Over Barbell Row", 4, "6-10"),
        ex("Upper Body", "Seated Dumbbell Shoulder Press", 3, "8-12"),
        ex("Upper Body", "Lat Pulldown", 3, "8-12"),
        ex("Upper Body", "Triceps Pushdown", 3, "10-15"),
      ],
      Tuesday: [
        ex("Lower Body", "Barbell Back Squat", 4, "5-8"),
        ex("Lower Body", "Romanian Deadlift", 3, "6-10"),
        ex("Lower Body", "Leg Press", 3, "10-12"),
        ex("Lower Body", "Seated Leg Curl", 3, "10-15"),
        ex("Lower Body", "Standing Calf Raise", 4, "10-15"),
      ],
      Wednesday: rest,
      Thursday: [
        ex("Upper Body", "Incline Dumbbell Press", 3, "8-12"),
        ex("Upper Body", "Chest Supported Row", 3, "8-12"),
        ex("Upper Body", "Cable Lateral Raise", 3, "12-15"),
        ex("Upper Body", "Face Pull", 3, "12-15"),
        ex("Upper Body", "Barbell Curl", 3, "10-15"),
      ],
      Friday: [
        ex("Lower Body", "Front Squat", 3, "6-10"),
        ex("Lower Body", "Dumbbell Bulgarian Split Squat", 3, "8-12"),
        ex("Lower Body", "Hip Thrust", 3, "8-12"),
        ex("Lower Body", "Leg Extension", 3, "12-15"),
        ex("Lower Body", "Seated Calf Raise", 4, "12-20"),
      ],
      Saturday: rest,
      Sunday: rest,
    },
  },
  {
    id: "ppl-3",
    name: "Push Pull Legs (3-Day)",
    daysPerWeek: 3,
    level: "Beginner",
    summary: "Compressed PPL for lifters training 3 days weekly.",
    schedule: {
      Monday: [
        ex("Push", "Barbell Bench Press", 4, "6-10"),
        ex("Push", "Incline Dumbbell Press", 3, "8-12"),
        ex("Push", "Seated Dumbbell Shoulder Press", 3, "8-12"),
        ex("Push", "Cable Lateral Raise", 3, "12-15"),
        ex("Push", "Cable Triceps Pushdown", 3, "10-15"),
      ],
      Tuesday: rest,
      Wednesday: [
        ex("Pull", "Pull-Up", 4, "6-10"),
        ex("Pull", "Barbell Row", 4, "6-10"),
        ex("Pull", "Seated Cable Row", 3, "8-12"),
        ex("Pull", "Face Pull", 3, "12-15"),
        ex("Pull", "Barbell Curl", 3, "10-15"),
      ],
      Thursday: rest,
      Friday: [
        ex("Legs", "Barbell Back Squat", 4, "6-10"),
        ex("Legs", "Romanian Deadlift", 3, "8-12"),
        ex("Legs", "Leg Press", 3, "10-12"),
        ex("Legs", "Leg Curl", 3, "10-15"),
        ex("Legs", "Standing Calf Raise", 4, "12-20"),
      ],
      Saturday: rest,
      Sunday: rest,
    },
  },
  {
    id: "ppl-6",
    name: "Push Pull Legs x2 (6-Day)",
    daysPerWeek: 6,
    level: "Intermediate",
    summary: "Classic high-frequency bodybuilding split.",
    schedule: {
      Monday: [
        ex("Push", "Barbell Bench Press", 4, "5-8"),
        ex("Push", "Incline Dumbbell Press", 3, "8-12"),
        ex("Push", "Overhead Press", 3, "6-10"),
        ex("Push", "Dumbbell Lateral Raise", 3, "12-15"),
        ex("Push", "Skull Crusher", 3, "10-15"),
      ],
      Tuesday: [
        ex("Pull", "Weighted Pull-Up", 4, "5-8"),
        ex("Pull", "Barbell Row", 4, "6-10"),
        ex("Pull", "Single Arm Dumbbell Row", 3, "8-12"),
        ex("Pull", "Rear Delt Fly", 3, "12-15"),
        ex("Pull", "EZ Bar Curl", 3, "10-15"),
      ],
      Wednesday: [
        ex("Legs", "Back Squat", 4, "5-8"),
        ex("Legs", "Romanian Deadlift", 3, "6-10"),
        ex("Legs", "Hack Squat", 3, "8-12"),
        ex("Legs", "Leg Curl", 3, "10-15"),
        ex("Legs", "Seated Calf Raise", 4, "12-20"),
      ],
      Thursday: [
        ex("Push", "Dumbbell Bench Press", 4, "8-12"),
        ex("Push", "Machine Chest Press", 3, "10-12"),
        ex("Push", "Seated Dumbbell Shoulder Press", 3, "8-12"),
        ex("Push", "Cable Lateral Raise", 3, "12-15"),
        ex("Push", "Rope Triceps Pushdown", 3, "10-15"),
      ],
      Friday: [
        ex("Pull", "Lat Pulldown", 4, "8-12"),
        ex("Pull", "Chest Supported Row", 3, "8-12"),
        ex("Pull", "Cable Row", 3, "10-12"),
        ex("Pull", "Face Pull", 3, "12-15"),
        ex("Pull", "Hammer Curl", 3, "10-15"),
      ],
      Saturday: [
        ex("Legs", "Front Squat", 4, "6-10"),
        ex("Legs", "Bulgarian Split Squat", 3, "8-12"),
        ex("Legs", "Hip Thrust", 3, "8-12"),
        ex("Legs", "Leg Extension", 3, "12-15"),
        ex("Legs", "Standing Calf Raise", 4, "12-20"),
      ],
      Sunday: rest,
    },
  },
  {
    id: "pplul-5",
    name: "PPL x UL (PPLUL)",
    daysPerWeek: 5,
    level: "Intermediate",
    summary: "Push/Pull/Legs plus Upper/Lower for a 5-day hybrid.",
    schedule: {
      Monday: [
        ex("Push", "Barbell Bench Press", 4, "6-10"),
        ex("Push", "Incline Dumbbell Press", 3, "8-12"),
        ex("Push", "Overhead Press", 3, "6-10"),
        ex("Push", "Cable Lateral Raise", 3, "12-15"),
        ex("Push", "Triceps Pushdown", 3, "10-15"),
      ],
      Tuesday: [
        ex("Pull", "Pull-Up", 4, "6-10"),
        ex("Pull", "Barbell Row", 4, "6-10"),
        ex("Pull", "Seated Cable Row", 3, "8-12"),
        ex("Pull", "Face Pull", 3, "12-15"),
        ex("Pull", "Barbell Curl", 3, "10-15"),
      ],
      Wednesday: [
        ex("Legs", "Back Squat", 4, "6-10"),
        ex("Legs", "Romanian Deadlift", 3, "8-12"),
        ex("Legs", "Leg Press", 3, "10-12"),
        ex("Legs", "Leg Curl", 3, "10-15"),
        ex("Legs", "Calf Raise", 4, "12-20"),
      ],
      Thursday: [
        ex("Upper Body", "Incline Bench Press", 4, "6-10"),
        ex("Upper Body", "Chest Supported Row", 4, "8-12"),
        ex("Upper Body", "Dumbbell Shoulder Press", 3, "8-12"),
        ex("Upper Body", "Lat Pulldown", 3, "8-12"),
        ex("Upper Body", "Hammer Curl", 3, "10-15"),
      ],
      Friday: [
        ex("Lower Body", "Front Squat", 4, "6-10"),
        ex("Lower Body", "Hip Thrust", 3, "8-12"),
        ex("Lower Body", "Walking Lunge", 3, "10-12"),
        ex("Lower Body", "Leg Extension", 3, "12-15"),
        ex("Lower Body", "Seated Calf Raise", 4, "12-20"),
      ],
      Saturday: rest,
      Sunday: rest,
    },
  },
  {
    id: "ulppl-5",
    name: "UL x PPL (ULPPL)",
    daysPerWeek: 5,
    level: "Intermediate",
    summary: "Upper/Lower first, then Push/Pull/Legs to finish the week.",
    schedule: {
      Monday: [
        ex("Upper Body", "Barbell Bench Press", 4, "5-8"),
        ex("Upper Body", "Weighted Pull-Up", 4, "5-8"),
        ex("Upper Body", "Overhead Press", 3, "6-10"),
        ex("Upper Body", "Barbell Row", 3, "6-10"),
        ex("Upper Body", "Dips", 3, "8-12"),
      ],
      Tuesday: [
        ex("Lower Body", "Back Squat", 4, "5-8"),
        ex("Lower Body", "Romanian Deadlift", 4, "6-10"),
        ex("Lower Body", "Leg Press", 3, "8-12"),
        ex("Lower Body", "Leg Curl", 3, "10-15"),
        ex("Lower Body", "Standing Calf Raise", 4, "12-20"),
      ],
      Wednesday: rest,
      Thursday: [
        ex("Push", "Incline Dumbbell Press", 3, "8-12"),
        ex("Push", "Machine Chest Press", 3, "10-12"),
        ex("Push", "Seated Dumbbell Shoulder Press", 3, "8-12"),
        ex("Push", "Cable Lateral Raise", 3, "12-15"),
        ex("Push", "Rope Pushdown", 3, "10-15"),
      ],
      Friday: [
        ex("Pull", "Lat Pulldown", 3, "8-12"),
        ex("Pull", "Seated Cable Row", 3, "8-12"),
        ex("Pull", "Single Arm Dumbbell Row", 3, "10-12"),
        ex("Pull", "Face Pull", 3, "12-15"),
        ex("Pull", "EZ Bar Curl", 3, "10-15"),
      ],
      Saturday: [
        ex("Legs", "Front Squat", 3, "8-12"),
        ex("Legs", "Bulgarian Split Squat", 3, "10-12"),
        ex("Legs", "Hip Thrust", 3, "8-12"),
        ex("Legs", "Leg Extension", 3, "12-15"),
        ex("Legs", "Seated Calf Raise", 4, "12-20"),
      ],
      Sunday: rest,
    },
  },
  {
    id: "arnold-6",
    name: "Arnold Split (6-Day)",
    daysPerWeek: 6,
    level: "Advanced",
    summary: "Chest/Back, Shoulders/Arms, Legs repeated twice weekly.",
    schedule: {
      Monday: [
        ex("Chest + Back", "Barbell Bench Press", 4, "6-10"),
        ex("Chest + Back", "Incline Dumbbell Press", 3, "8-12"),
        ex("Chest + Back", "Pull-Up", 4, "6-10"),
        ex("Chest + Back", "Barbell Row", 3, "8-12"),
        ex("Chest + Back", "Dumbbell Pullover", 3, "10-12"),
      ],
      Tuesday: [
        ex("Shoulders + Arms", "Overhead Press", 4, "6-10"),
        ex("Shoulders + Arms", "Dumbbell Lateral Raise", 4, "12-15"),
        ex("Shoulders + Arms", "Rear Delt Fly", 3, "12-15"),
        ex("Shoulders + Arms", "Barbell Curl", 3, "10-12"),
        ex("Shoulders + Arms", "Skull Crusher", 3, "10-12"),
      ],
      Wednesday: [
        ex("Legs", "Back Squat", 4, "6-10"),
        ex("Legs", "Romanian Deadlift", 4, "6-10"),
        ex("Legs", "Leg Press", 3, "10-12"),
        ex("Legs", "Leg Curl", 3, "10-15"),
        ex("Legs", "Standing Calf Raise", 4, "12-20"),
      ],
      Thursday: [
        ex("Chest + Back", "Incline Bench Press", 3, "8-12"),
        ex("Chest + Back", "Machine Chest Fly", 3, "12-15"),
        ex("Chest + Back", "Lat Pulldown", 3, "8-12"),
        ex("Chest + Back", "Chest Supported Row", 3, "10-12"),
        ex("Chest + Back", "Straight Arm Pulldown", 3, "12-15"),
      ],
      Friday: [
        ex("Shoulders + Arms", "Seated Dumbbell Shoulder Press", 3, "8-12"),
        ex("Shoulders + Arms", "Cable Lateral Raise", 3, "12-15"),
        ex("Shoulders + Arms", "Face Pull", 3, "12-15"),
        ex("Shoulders + Arms", "Hammer Curl", 3, "10-15"),
        ex("Shoulders + Arms", "Rope Pushdown", 3, "10-15"),
      ],
      Saturday: [
        ex("Legs", "Front Squat", 3, "8-12"),
        ex("Legs", "Walking Lunges", 3, "10-12"),
        ex("Legs", "Hip Thrust", 3, "8-12"),
        ex("Legs", "Leg Extension", 3, "12-15"),
        ex("Legs", "Seated Calf Raise", 4, "12-20"),
      ],
      Sunday: rest,
    },
  },
  {
    id: "bro-5",
    name: "Bro Split (5-Day)",
    daysPerWeek: 5,
    level: "Intermediate",
    summary: "Traditional one-muscle-group-per-day bodybuilding format.",
    schedule: {
      Monday: [
        ex("Chest", "Barbell Bench Press", 4, "6-10"),
        ex("Chest", "Incline Dumbbell Press", 3, "8-12"),
        ex("Chest", "Machine Chest Press", 3, "10-12"),
        ex("Chest", "Cable Fly", 3, "12-15"),
      ],
      Tuesday: [
        ex("Back", "Pull-Up", 4, "6-10"),
        ex("Back", "Barbell Row", 4, "8-10"),
        ex("Back", "Lat Pulldown", 3, "10-12"),
        ex("Back", "Seated Cable Row", 3, "10-12"),
      ],
      Wednesday: [
        ex("Shoulders", "Overhead Press", 4, "6-10"),
        ex("Shoulders", "Dumbbell Lateral Raise", 4, "12-15"),
        ex("Shoulders", "Rear Delt Fly", 3, "12-15"),
        ex("Shoulders", "Upright Row", 3, "10-12"),
      ],
      Thursday: [
        ex("Legs", "Back Squat", 4, "6-10"),
        ex("Legs", "Romanian Deadlift", 3, "8-12"),
        ex("Legs", "Leg Press", 3, "10-12"),
        ex("Legs", "Leg Curl", 3, "10-15"),
        ex("Legs", "Calf Raise", 4, "12-20"),
      ],
      Friday: [
        ex("Arms", "Barbell Curl", 4, "8-12"),
        ex("Arms", "Hammer Curl", 3, "10-15"),
        ex("Arms", "Skull Crusher", 4, "8-12"),
        ex("Arms", "Cable Triceps Pushdown", 3, "10-15"),
      ],
      Saturday: rest,
      Sunday: rest,
    },
  },
  {
    id: "torso-limbs-4",
    name: "Torso / Limbs (4-Day)",
    daysPerWeek: 4,
    level: "Intermediate",
    summary: "Torso-focused days alternating with limbs-focused days.",
    schedule: {
      Monday: [
        ex("Torso", "Barbell Bench Press", 4, "6-10"),
        ex("Torso", "Barbell Row", 4, "6-10"),
        ex("Torso", "Overhead Press", 3, "8-12"),
        ex("Torso", "Lat Pulldown", 3, "8-12"),
      ],
      Tuesday: [
        ex("Limbs", "Back Squat", 4, "6-10"),
        ex("Limbs", "Romanian Deadlift", 3, "8-12"),
        ex("Limbs", "Barbell Curl", 3, "10-15"),
        ex("Limbs", "Skull Crusher", 3, "10-15"),
        ex("Limbs", "Calf Raise", 4, "12-20"),
      ],
      Wednesday: rest,
      Thursday: [
        ex("Torso", "Incline Dumbbell Press", 3, "8-12"),
        ex("Torso", "Seated Cable Row", 3, "8-12"),
        ex("Torso", "Machine Shoulder Press", 3, "10-12"),
        ex("Torso", "Face Pull", 3, "12-15"),
      ],
      Friday: [
        ex("Limbs", "Leg Press", 3, "10-12"),
        ex("Limbs", "Leg Curl", 3, "10-15"),
        ex("Limbs", "Hammer Curl", 3, "10-15"),
        ex("Limbs", "Rope Pushdown", 3, "10-15"),
        ex("Limbs", "Seated Calf Raise", 4, "12-20"),
      ],
      Saturday: rest,
      Sunday: rest,
    },
  },
  {
    id: "phul-4",
    name: "PHUL (4-Day)",
    daysPerWeek: 4,
    level: "Intermediate",
    summary: "Power Hypertrophy Upper Lower blend for strength + size.",
    schedule: {
      Monday: [
        ex("Upper Power", "Barbell Bench Press", 5, "3-5"),
        ex("Upper Power", "Barbell Row", 5, "3-5"),
        ex("Upper Power", "Overhead Press", 4, "4-6"),
        ex("Upper Power", "Weighted Pull-Up", 4, "4-6"),
      ],
      Tuesday: [
        ex("Lower Power", "Back Squat", 5, "3-5"),
        ex("Lower Power", "Deadlift", 4, "3-5"),
        ex("Lower Power", "Leg Press", 3, "6-10"),
        ex("Lower Power", "Standing Calf Raise", 4, "8-12"),
      ],
      Wednesday: rest,
      Thursday: [
        ex("Upper Hypertrophy", "Incline Dumbbell Press", 4, "8-12"),
        ex("Upper Hypertrophy", "Lat Pulldown", 4, "8-12"),
        ex("Upper Hypertrophy", "Seated Dumbbell Shoulder Press", 3, "10-12"),
        ex("Upper Hypertrophy", "Cable Fly", 3, "12-15"),
        ex("Upper Hypertrophy", "EZ Bar Curl", 3, "10-15"),
      ],
      Friday: [
        ex("Lower Hypertrophy", "Front Squat", 4, "8-12"),
        ex("Lower Hypertrophy", "Romanian Deadlift", 4, "8-12"),
        ex("Lower Hypertrophy", "Walking Lunge", 3, "10-12"),
        ex("Lower Hypertrophy", "Leg Curl", 3, "12-15"),
        ex("Lower Hypertrophy", "Seated Calf Raise", 4, "12-20"),
      ],
      Saturday: rest,
      Sunday: rest,
    },
  },
];

export const buildDraftFromTemplate = (template: RoutineTemplate): PlannerDraft => {
  return Object.fromEntries(
    weekdays.map((day) => {
      const items = template.schedule[day].map((session) => ({
        id: createItemId(),
        exerciseId: "",
        sets: session.sets,
        reps: session.reps,
        templateLabel: session.label,
        preferredExerciseName: session.exerciseName ?? getDefaultExerciseName(session.label),
      }));

      return [day, { items }];
    }),
  ) as PlannerDraft;
};
