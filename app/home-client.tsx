"use client";

import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { loadPlannerDraft } from "@/lib/planner-db";
import { plannerStorageKey, weekdays, type PlannerDraft, type PlannerWorkoutItem } from "@/lib/routine-templates";

const emptyDraft: PlannerDraft = Object.fromEntries(
  weekdays.map((day) => [day, { items: [] }]),
) as unknown as PlannerDraft;

const createItemId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const parsePositiveInt = (value: unknown, fallback = 3): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
};

const normalizeItem = (item: unknown): PlannerWorkoutItem | null => {
  if (!item || typeof item !== "object") return null;
  const data = item as Partial<PlannerWorkoutItem>;

  return {
    id: typeof data.id === "string" && data.id.trim() ? data.id : createItemId(),
    exerciseId: typeof data.exerciseId === "string" ? data.exerciseId : "",
    sets: parsePositiveInt(data.sets, 3),
    reps: typeof data.reps === "string" && data.reps.trim() ? data.reps : "8-12",
    templateLabel: typeof data.templateLabel === "string" ? data.templateLabel : "",
    preferredExerciseName:
      typeof data.preferredExerciseName === "string" ? data.preferredExerciseName : "",
  };
};

const normalizeDraft = (draft: unknown): PlannerDraft => {
  if (!draft || typeof draft !== "object") return emptyDraft;

  return Object.fromEntries(
    weekdays.map((day) => {
      const raw = (draft as Record<string, unknown>)[day];
      if (!raw || typeof raw !== "object") return [day, { items: [] }];

      const dayPlan = raw as Record<string, unknown>;
      if (Array.isArray(dayPlan.items)) {
        return [day, { items: dayPlan.items.map(normalizeItem).filter(Boolean) as PlannerWorkoutItem[] }];
      }

      const legacyItem = normalizeItem(dayPlan);
      if (!legacyItem || !legacyItem.exerciseId) return [day, { items: [] }];
      return [day, { items: [legacyItem] }];
    }),
  ) as PlannerDraft;
};

const hasPlan = (draft: PlannerDraft) =>
  weekdays.some((day) => draft[day].items.some((item) => item.exerciseId.trim()));

const weekdayToIndex = (weekday: string): number => {
  const lookup = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  } as const;
  return lookup[weekday as keyof typeof lookup] ?? 0;
};

const formatIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const monthFromIso = (iso: string) => iso.slice(0, 7);

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

type ActivityStatus = "attended" | "missed";

const getStatusLabel = (status: ActivityStatus | null) => {
  if (status === "attended") return "Attended";
  if (status === "missed") return "Missed";
  return "Not logged";
};

export default function HomeClient() {
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlannerDraft>(emptyDraft);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  const [activityLog, setActivityLog] = useState<Record<string, ActivityStatus>>({});
  const [selectedDayName, setSelectedDayName] = useState(weekdays[0]);
  const [showQuickLog, setShowQuickLog] = useState(true);

  const now = useMemo(() => new Date(), []);
  const activityStoragePrefix = `homeActivity:${userId ?? "guest"}:`;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUserId(user?.uid ?? null);
      setIsAuthResolved(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAuthResolved) return;

    let isCancelled = false;
    let localDraft = emptyDraft;
    const localRaw = window.localStorage.getItem(plannerStorageKey);
    if (localRaw) {
      try {
        localDraft = normalizeDraft(JSON.parse(localRaw));
      } catch {
        localDraft = emptyDraft;
      }
    }

    const hydrate = async () => {
      if (!userId) {
        if (!isCancelled) {
          setPlan(localDraft);
          setIsLoadingPlan(false);
        }
        return;
      }

      try {
        const remoteDraft = await loadPlannerDraft(userId);
        if (isCancelled) return;
        setPlan(normalizeDraft(remoteDraft ?? localDraft));
      } catch {
        if (isCancelled) return;
        setPlan(localDraft);
      } finally {
        if (!isCancelled) setIsLoadingPlan(false);
      }
    };

    setIsLoadingPlan(true);
    void hydrate();

    return () => {
      isCancelled = true;
    };
  }, [isAuthResolved, userId]);

  useEffect(() => {
    const merged: Record<string, ActivityStatus> = {};

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(activityStoragePrefix)) continue;

      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") continue;
        for (const [iso, status] of Object.entries(parsed)) {
          if ((status === "attended" || status === "missed") && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
            merged[iso] = status;
          }
        }
      } catch {
        // Ignore invalid stored values.
      }
    }

    setActivityLog(merged);
  }, [activityStoragePrefix]);

  const plannedWeekdays = useMemo(
    () =>
      new Set(
        weekdays
          .filter((day) => plan[day].items.some((item) => item.exerciseId.trim()))
          .map((day) => weekdayToIndex(day)),
      ),
    [plan],
  );

  const totalPlannedDays = useMemo(() => weekdays.filter((day) => plan[day].items.length > 0).length, [plan]);
  const totalWorkouts = useMemo(
    () => weekdays.reduce((sum, day) => sum + plan[day].items.filter((item) => item.exerciseId.trim()).length, 0),
    [plan],
  );

  const todayIso = formatIsoDate(now);
  const chartEnd = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);
  const chartStart = useMemo(() => addDays(chartEnd, -364), [chartEnd]);
  const periodDays = useMemo(() => {
    const list: Date[] = [];
    const cursor = new Date(chartStart);
    while (cursor <= chartEnd) {
      list.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return list;
  }, [chartEnd, chartStart]);

  const attendedCount = useMemo(() => {
    let count = 0;
    for (const day of periodDays) {
      const iso = formatIsoDate(day);
      if (activityLog[iso] === "attended") count += 1;
    }
    return count;
  }, [activityLog, periodDays]);

  const missedCount = useMemo(() => {
    let count = 0;
    for (const day of periodDays) {
      const iso = formatIsoDate(day);
      if (activityLog[iso] === "missed") count += 1;
    }
    return count;
  }, [activityLog, periodDays]);

  const recentActivity = useMemo(
    () =>
      Array.from({ length: 4 }, (_, index) => {
        const offset = 3 - index;
        const day = addDays(chartEnd, -offset);
        const iso = formatIsoDate(day);
        const planned = plannedWeekdays.has(day.getDay());
        const status = activityLog[iso] ?? null;
        const isToday = iso === todayIso;
        return { day, iso, planned, status, isToday };
      }),
    [activityLog, chartEnd, plannedWeekdays, todayIso],
  );
  const todayActivity = useMemo(
    () => recentActivity.find((entry) => entry.isToday) ?? null,
    [recentActivity],
  );

  const plannedDaySummaries = useMemo(
    () =>
      weekdays.map((day) => {
        const items = plan[day].items.filter((item) => item.exerciseId.trim());
        return {
          day,
          items,
          totalSets: items.reduce((sum, item) => sum + item.sets, 0),
          isRest: items.length === 0,
        };
      }),
    [plan],
  );

  useEffect(() => {
    const hasSelectedDay = plannedDaySummaries.some((entry) => entry.day === selectedDayName);
    if (!hasSelectedDay) {
      setSelectedDayName(plannedDaySummaries.find((entry) => !entry.isRest)?.day ?? plannedDaySummaries[0]?.day ?? weekdays[0]);
    }
  }, [plannedDaySummaries, selectedDayName]);

  const selectedDaySummary = useMemo(
    () =>
      plannedDaySummaries.find((entry) => entry.day === selectedDayName) ??
      plannedDaySummaries.find((entry) => !entry.isRest) ??
      plannedDaySummaries[0],
    [plannedDaySummaries, selectedDayName],
  );

  const currentStreak = useMemo(() => {
    let streak = 0;
    const cursor = new Date(chartEnd);
    while (true) {
      const iso = formatIsoDate(cursor);
      if (activityLog[iso] !== "attended") break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      if (cursor < chartStart) break;
    }
    return streak;
  }, [activityLog, chartEnd, chartStart]);

  const plannedLast30 = useMemo(() => {
    const start = addDays(chartEnd, -29);
    let planned = 0;
    let attendedOnPlanned = 0;
    const cursor = new Date(start);
    while (cursor <= chartEnd) {
      const iso = formatIsoDate(cursor);
      if (plannedWeekdays.has(cursor.getDay())) {
        planned += 1;
        if (activityLog[iso] === "attended") attendedOnPlanned += 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    const rate = planned === 0 ? 0 : Math.round((attendedOnPlanned / planned) * 100);
    return { planned, attendedOnPlanned, rate };
  }, [activityLog, chartEnd, plannedWeekdays]);

  const weekdayActivity = useMemo(
    () =>
      (() => {
        const currentDayIndex = chartEnd.getDay();
        const todayDay = weekdays.find((day) => weekdayToIndex(day) === currentDayIndex) ?? weekdays[0];
        const orderedDays = [...weekdays.filter((day) => day !== todayDay), todayDay];

        return orderedDays.map((day) => {
          const dayIndex = weekdayToIndex(day);
          let attended = 0;
          for (const date of periodDays) {
            if (date.getDay() !== dayIndex) continue;
            if (activityLog[formatIsoDate(date)] === "attended") attended += 1;
          }
          return { day, attended, isToday: dayIndex === currentDayIndex };
        });
      })(),
    [activityLog, chartEnd, periodDays],
  );

  const maxWeekdayAttendance = Math.max(...weekdayActivity.map((entry) => entry.attended), 1);

  const readinessScore = Math.min(100, Math.round((totalPlannedDays / 7) * 45 + plannedLast30.rate * 0.55));
  const consistencyMessage =
    plannedLast30.rate >= 80
      ? "Strong rhythm. Keep the current pace."
      : plannedLast30.rate >= 55
        ? "Good base. A bit more consistency will compound fast."
        : "Start small and protect the schedule you can realistically keep.";
  const todayStatusLabel = getStatusLabel(todayActivity?.status ?? null);

  const setActivityStatus = (day: Date, status: ActivityStatus | null) => {
    const iso = formatIsoDate(day);
    if (iso !== todayIso) return;

    setActivityLog((current) => {
      const next = { ...current };
      if (status) {
        next[iso] = status;
      } else {
        delete next[iso];
      }
      const touchedMonth = monthFromIso(iso);
      const nextMonthValues = Object.fromEntries(
        Object.entries(next).filter(([valueIso]) => monthFromIso(valueIso) === touchedMonth),
      );
      window.localStorage.setItem(
        `${activityStoragePrefix}${touchedMonth}`,
        JSON.stringify(nextMonthValues),
      );
      return next;
    });
  };

  const showDashboard = hasPlan(plan);
  if (!isAuthResolved || (userId && isLoadingPlan)) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading your training dashboard...
        </section>
      </main>
    );
  }

  if (!userId) {
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arc Workout Planner",
      description:
        "Arc helps lifters and gym beginners create workouts, save routines, and organize weekly training plans.",
      url: "/training-dashboard",
      mainEntity: {
        "@type": "SoftwareApplication",
        name: "Arc Workout Planner",
        applicationCategory: "HealthApplication",
        operatingSystem: "Web",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      },
      about: [
        "Workout planning",
        "Strength training routine builder",
        "Weekly gym schedule",
      ],
    };

    const faqStructuredData = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Who is Arc Workout Planner for?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Arc is for gym-goers who want a repeatable weekly training structure for strength, hypertrophy, or general fitness.",
          },
        },
        {
          "@type": "Question",
          name: "Can I save routines and reuse them later?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Arc lets you save routines and apply them to your weekly plan so programming stays consistent.",
          },
        },
        {
          "@type": "Question",
          name: "Do I need to pay to start?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. You can create an account and start planning workouts for free.",
          },
        },
      ],
    };

    return (
      <main className="relative overflow-hidden px-4 py-8 sm:px-8 sm:py-12">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
        />

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.24)_0%,_rgba(248,250,252,0)_54%)] dark:bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.12)_0%,_rgba(16,21,29,0)_58%)]" />

        <section className="relative mx-auto w-full max-w-6xl rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_90px_-35px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10 dark:border-slate-700/90 dark:bg-slate-900/80 dark:shadow-[0_24px_90px_-35px_rgba(0,0,0,0.65)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-700 dark:text-orange-300">
            Workout planning software
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-slate-100">
            Plan better gym weeks with Arc Workout Planner
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg dark:text-slate-300">
            Build workouts, save routines, and map your weekly split with one system designed for consistent training progression.
          </p>

          <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="w-full rounded-lg bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Create free account
            </Link>
            <Link
              href="/login"
              className="w-full rounded-lg border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-900 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Login
            </Link>
          </div>
        </section>

        <section className="mx-auto mt-10 grid w-full max-w-6xl gap-4 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Workout Builder</h2>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
              Create structured sessions with sets, reps, and exercise selections built for progression.
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Routine Library</h2>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
              Save reusable templates like push/pull/legs or custom splits for faster weekly planning.
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Weekly Planner</h2>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
              Organize your calendar so training volume stays balanced and sustainable each week.
            </p>
          </article>
        </section>

        <section className="mx-auto mt-10 w-full max-w-6xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Arc Workout Planner FAQ</h2>
          <div className="mt-4 space-y-4 text-sm text-slate-700 dark:text-slate-200">
            <article>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Who should use Arc?</h3>
              <p className="mt-1">Anyone who wants a clearer weekly gym structure, from beginners to experienced lifters.</p>
            </article>
            <article>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">What can I plan inside Arc?</h3>
              <p className="mt-1">You can build workouts, save routines, and schedule training days across the week.</p>
            </article>
            <article>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">How do I get started?</h3>
              <p className="mt-1">Create a free account, then start with workouts or jump directly into the weekly planner.</p>
            </article>
          </div>
        </section>
      </main>
    );
  }

  if (!showDashboard) {
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Arc Workout Planner",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web",
      description:
        "A web app for building workouts, saving routines, and creating a weekly training plan.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    };

    return (
      <main className="relative overflow-hidden px-4 py-8 sm:px-8 sm:py-12">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.24)_0%,_rgba(248,250,252,0)_54%)] dark:bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.12)_0%,_rgba(16,21,29,0)_58%)]" />

        <section className="relative mx-auto w-full max-w-6xl rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_90px_-35px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10 dark:border-slate-700/90 dark:bg-slate-900/80 dark:shadow-[0_24px_90px_-35px_rgba(0,0,0,0.65)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-700 dark:text-orange-300">
            Train with intent
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-slate-100">
            Plan smarter gym weeks with Arc Workout Planner
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg dark:text-slate-300">
            Build clear workouts, reuse routines, and organize your weekly split
            from one dashboard designed for consistency and progression.
          </p>

          <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row">
            <Link
              href="/workouts"
              className="w-full rounded-lg bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Start a workout plan
            </Link>
            <Link
              href="/planner"
              className="w-full rounded-lg border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-900 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Open weekly planner
            </Link>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Workout Builder
              </p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                Compose session details and exercise flow quickly.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Routines
              </p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                Save templates for push, pull, legs, or custom splits.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Weekly Planning
              </p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                Map your schedule and keep training balanced.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-10 w-full max-w-6xl">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
            Built for practical strength and fitness programming
          </h2>
          <p className="mt-3 max-w-4xl text-slate-600 dark:text-slate-300">
            Whether you are planning hypertrophy blocks, strength sessions, or a
            general fitness routine, Arc helps you create a repeatable
            system for training decisions each week.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell relative overflow-hidden px-4 py-8 sm:px-8 sm:py-12">
      <div className="dashboard-grid pointer-events-none absolute inset-0 opacity-50" />
      <div className="dashboard-glow dashboard-glow--amber pointer-events-none absolute -left-14 top-0 h-52 w-52" />
      <div className="dashboard-glow dashboard-glow--blue pointer-events-none absolute right-0 top-32 h-72 w-72" />

      <section className="dashboard-panel relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(145deg,rgba(255,247,237,0.9),rgba(255,255,255,0.88))] p-6 shadow-[0_28px_90px_-45px_rgba(15,23,42,0.45)] backdrop-blur dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(30,41,59,0.95),rgba(15,23,42,0.96))] sm:p-8">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#fb923c,#f97316,#38bdf8)]" />
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="dashboard-float inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-orange-100/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-orange-700 dark:border-orange-300/20 dark:bg-orange-500/10 dark:text-orange-200">
              Your Training Dashboard
            </div>
            <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-slate-900 dark:text-slate-50 sm:text-5xl">
              Smoother progress tracking that is easier to read and easier to use
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
              See your weekly structure, today&apos;s training status, and consistency trends in one cleaner beginner-friendly view.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/planner"
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                Edit weekly plan
              </Link>
              <Link
                href="/workouts"
                className="rounded-2xl border border-slate-300 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-900 transition duration-300 hover:-translate-y-0.5 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
              >
                Browse exercises
              </Link>
              <Link
                href="/bmi"
                className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-3 text-sm font-semibold text-orange-800 transition duration-300 hover:-translate-y-0.5 hover:bg-orange-100 dark:border-orange-300/20 dark:bg-orange-500/10 dark:text-orange-100 dark:hover:bg-orange-500/15"
              >
                Open BMI page
              </Link>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.5rem] border border-white/70 bg-white/80 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Plan coverage</p>
                <p className="mt-2 text-3xl font-black text-slate-900 dark:text-slate-100">{totalPlannedDays} / 7</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">days already mapped out</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/70 bg-white/80 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Monthly rhythm</p>
                <p className="mt-2 text-3xl font-black text-orange-700 dark:text-orange-300">{plannedLast30.rate}%</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">adherence on planned days</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/70 bg-white/80 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Today status</p>
                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{todayStatusLabel}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">quick log available below</p>
              </div>
            </div>
          </div>

          <aside className="rounded-[1.75rem] border border-orange-200/70 bg-[linear-gradient(160deg,rgba(255,255,255,0.82),rgba(255,237,213,0.82))] p-5 shadow-[0_22px_45px_rgba(249,115,22,0.14)] dark:border-orange-300/20 dark:bg-[linear-gradient(160deg,rgba(67,20,7,0.72),rgba(30,41,59,0.82))]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-300">
              Readiness snapshot
            </p>
            <div className="mt-4 rounded-[1.5rem] bg-slate-950 p-5 text-white shadow-[0_20px_36px_rgba(15,23,42,0.22)]">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-5xl font-black">{readinessScore}</p>
                  <p className="mt-2 text-sm text-slate-300">weekly readiness score</p>
                </div>
                <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-orange-100">
                  {currentStreak} day streak
                </div>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#fb923c,#f97316,#38bdf8)] transition-[width] duration-700"
                  style={{ width: `${Math.max(10, readinessScore)}%` }}
                />
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">{consistencyMessage}</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-[1.25rem] border border-white/70 bg-white/75 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Attended</p>
                <p className="mt-2 text-2xl font-black text-orange-700 dark:text-orange-300">{attendedCount}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">last 12 months</p>
              </div>
              <div className="rounded-[1.25rem] border border-white/70 bg-white/75 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Missed</p>
                <p className="mt-2 text-2xl font-black text-rose-700 dark:text-rose-300">{missedCount}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">last 12 months</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto mt-6 grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="dashboard-panel rounded-[1.75rem] border border-slate-200/80 bg-white/85 p-5 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.32)] backdrop-blur dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">Activity overview</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Based on the last 12 months of marked activity</p>
            </div>
            <button
              type="button"
              onClick={() => setShowQuickLog((value) => !value)}
              className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-800 transition duration-300 hover:-translate-y-0.5 hover:bg-orange-100 dark:border-orange-300/20 dark:bg-orange-500/10 dark:text-orange-100 dark:hover:bg-orange-500/15"
            >
              {showQuickLog ? "Hide quick log" : "Show quick log"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/90 p-4 transition hover:-translate-y-0.5 hover:shadow-[0_18px_30px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900/50">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Current streak</p>
              <p className="mt-2 text-3xl font-black text-orange-700 dark:text-orange-300">{currentStreak}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">consecutive attended days</p>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/90 p-4 transition hover:-translate-y-0.5 hover:shadow-[0_18px_30px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900/50">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Planned check-ins</p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-slate-100">
                {plannedLast30.attendedOnPlanned}/{plannedLast30.planned}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">completed on planned days</p>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/90 p-4 transition hover:-translate-y-0.5 hover:shadow-[0_18px_30px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900/50">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Total sessions</p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-slate-100">{attendedCount}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">attendance marks in 12 months</p>
            </div>
          </div>

          {showQuickLog ? (
            <div className="mt-4 rounded-[1.5rem] border border-orange-200/80 bg-[linear-gradient(145deg,rgba(255,247,237,0.82),rgba(255,255,255,0.92))] p-4 shadow-[0_18px_30px_rgba(249,115,22,0.1)] dark:border-orange-300/20 dark:bg-[linear-gradient(145deg,rgba(124,45,18,0.16),rgba(30,41,59,0.72))]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Update today only
                  {todayActivity ? (
                    <span className="ml-1 text-slate-500 dark:text-slate-400">
                      ({todayActivity.day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })})
                    </span>
                  ) : null}
                </p>
                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-orange-800 dark:bg-white/10 dark:text-orange-100">
                  Current: {todayStatusLabel}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (todayActivity) setActivityStatus(todayActivity.day, "attended");
                  }}
                  disabled={!todayActivity}
                  className={`min-w-[140px] rounded-2xl px-5 py-3 text-base font-bold transition duration-300 ${
                    todayActivity?.status === "attended"
                      ? "bg-orange-500 text-white shadow-[0_16px_28px_rgba(249,115,22,0.22)]"
                      : "border border-orange-300 bg-white text-orange-800 hover:-translate-y-0.5 hover:bg-orange-50"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  Attended
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (todayActivity) setActivityStatus(todayActivity.day, "missed");
                  }}
                  disabled={!todayActivity}
                  className={`min-w-[140px] rounded-2xl px-5 py-3 text-base font-bold transition duration-300 ${
                    todayActivity?.status === "missed"
                      ? "bg-rose-500 text-white shadow-[0_16px_28px_rgba(244,63,94,0.22)]"
                      : "border border-rose-300 bg-white text-rose-800 hover:-translate-y-0.5 hover:bg-rose-50"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  Missed
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (todayActivity) setActivityStatus(todayActivity.day, null);
                  }}
                  disabled={!todayActivity}
                  className="min-w-[140px] rounded-2xl border border-slate-300 bg-white px-5 py-3 text-base font-bold text-slate-700 transition duration-300 hover:-translate-y-0.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-5 rounded-[1.6rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(18,26,39,0.98),rgba(25,36,58,0.98))] p-6 text-white shadow-[0_24px_60px_-35px_rgba(15,23,42,0.7)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(22,34,54,0.98))]">
            <h3 className="text-[1.15rem] font-black text-slate-100 sm:text-xl">Activity by planned weekday</h3>
            <div className="mt-5 space-y-4">
              {weekdayActivity.map((item) => {
                const width = Math.max(8, Math.round((item.attended / maxWeekdayAttendance) * 100));
                return (
                  <div
                    key={item.day}
                    className="grid grid-cols-[minmax(112px,148px)_1fr_28px] items-center gap-4 text-sm sm:grid-cols-[minmax(132px,168px)_1fr_32px] sm:text-base"
                  >
                    <span className="inline-flex flex-wrap items-center gap-2 text-slate-300">
                      {item.day}
                      {item.isToday ? (
                        <span className="rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          Today
                        </span>
                      ) : null}
                    </span>
                    <div className="h-3 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#fb923c,#f97316,#38bdf8)] transition-[width] duration-700"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <span className="text-right text-lg font-semibold text-slate-200">{item.attended}</span>
                  </div>
                );
              })}
            </div>
          </div>

        </article>

        <article className="dashboard-panel rounded-[1.75rem] border border-slate-200/80 bg-white/85 p-5 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.32)] backdrop-blur dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">Recent activity</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
              last 4 days
            </span>
          </div>
          <ul className="mt-4 space-y-2.5">
            {recentActivity.map((entry, index) => (
              <li key={entry.iso}>
                <div
                  className="rounded-[1.25rem] border border-slate-200 bg-slate-50/90 px-3 py-3 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900/50"
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {entry.day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {entry.planned ? "Planned training day" : "Recovery or unplanned day"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        entry.status === "attended"
                          ? "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-200"
                          : entry.status === "missed"
                            ? "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200"
                            : "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300"
                      }`}
                    >
                      {getStatusLabel(entry.status)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="mx-auto mt-6 max-w-6xl">
        <div className="dashboard-panel rounded-[1.75rem] border border-slate-200/80 bg-white/85 p-5 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.32)] backdrop-blur dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">Weekly workout plan</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{totalWorkouts} workouts planned this week</p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
              Tap a day for details
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {plannedDaySummaries.map((entry) => {
                const isSelected = entry.day === selectedDaySummary?.day;
                return (
                  <button
                    key={entry.day}
                    type="button"
                    onClick={() => setSelectedDayName(entry.day)}
                    className={`text-left rounded-[1.35rem] border p-4 transition duration-300 ${
                      isSelected
                        ? "border-orange-300 bg-[linear-gradient(145deg,rgba(255,247,237,0.92),rgba(255,255,255,0.96))] shadow-[0_18px_34px_rgba(249,115,22,0.14)] dark:border-orange-300/30 dark:bg-[linear-gradient(145deg,rgba(124,45,18,0.18),rgba(30,41,59,0.82))]"
                        : "border-slate-200 bg-slate-50/85 hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{entry.day}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {entry.isRest ? "Recovery day" : `${entry.items.length} workout${entry.items.length === 1 ? "" : "s"}`}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${entry.isRest ? "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300" : "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-200"}`}>
                        {entry.isRest ? "Rest" : `${entry.totalSets} sets`}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center gap-1">
                      {Array.from({ length: Math.min(4, Math.max(entry.items.length, 1)) }, (_, index) => (
                        <span
                          key={`${entry.day}-${index}`}
                          className={`h-2.5 flex-1 rounded-full ${entry.isRest ? "bg-slate-200 dark:bg-white/10" : index < entry.items.length ? "bg-[linear-gradient(90deg,#fb923c,#f97316)]" : "bg-orange-100 dark:bg-orange-500/10"}`}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50/90 p-5 dark:border-white/10 dark:bg-slate-900/50">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-300">Selected day</p>
              <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{selectedDaySummary?.day}</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {selectedDaySummary?.isRest
                  ? "Use this day for recovery, walking, mobility, or light stretching."
                  : `${selectedDaySummary?.items.length ?? 0} planned workout items with ${selectedDaySummary?.totalSets ?? 0} total sets.`}
              </p>

              {selectedDaySummary?.isRest ? (
                <div className="mt-5 rounded-[1.25rem] border border-dashed border-slate-300 bg-white/80 p-4 text-sm leading-6 text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-slate-300">
                  Recovery still supports progress. If you feel fresh, keep it easy and protect the rest of your week.
                </div>
              ) : (
                <ul className="mt-5 space-y-3">
                  {selectedDaySummary?.items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5"
                    >
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {item.preferredExerciseName || item.templateLabel || "Workout"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {item.sets} sets • {item.reps} reps
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
