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

export default function HomeClient() {
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlannerDraft>(emptyDraft);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  const [activityLog, setActivityLog] = useState<Record<string, ActivityStatus>>({});

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
      url: "/",
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
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-8 sm:py-12">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
          Your Training Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
          Your workout plan and monthly consistency
        </h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          You already have a workout split, so the Training Dashboard now shows your activity and consistency metrics.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/planner"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Edit weekly plan
          </Link>
          <Link
            href="/workouts"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            Browse exercises
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-600">Planned days</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{totalPlannedDays} / 7</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-600">Attended (last 12 months)</p>
          <p className="mt-1 text-2xl font-bold text-orange-700">{attendedCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-600">Missed (last 12 months)</p>
          <p className="mt-1 text-2xl font-bold text-rose-700">{missedCount}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">Activity overview</h2>
            <p className="text-xs text-slate-500">Based on the last 12 months</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current streak</p>
              <p className="mt-1 text-2xl font-black text-orange-700">{currentStreak}</p>
              <p className="text-xs text-slate-500">consecutive attended days</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">30-day adherence</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{plannedLast30.rate}%</p>
              <p className="text-xs text-slate-500">
                {plannedLast30.attendedOnPlanned}/{plannedLast30.planned} planned days marked attended
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total sessions</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{attendedCount}</p>
              <p className="text-xs text-slate-500">attendance marks in 12 months</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold text-slate-700">Activity by planned weekday</p>
            {weekdayActivity.map((item) => {
              const max = Math.max(...weekdayActivity.map((row) => row.attended), 1);
              const width = Math.max(8, Math.round((item.attended / max) * 100));
              return (
                <div
                  key={item.day}
                  className="grid grid-cols-[minmax(116px,148px)_1fr_28px] items-center gap-2 text-sm"
                >
                  <span className="inline-flex flex-wrap items-center gap-1 text-slate-600">
                    {item.day}
                    {item.isToday ? (
                      <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                        Today
                      </span>
                    ) : null}
                  </span>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-orange-500" style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-right font-semibold text-slate-700">{item.attended}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">Only today can be updated.</p>
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-600">
              Update today only
              {todayActivity ? (
                <span className="ml-1 text-slate-500">
                  ({todayActivity.day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })})
                </span>
              ) : null}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  if (todayActivity) setActivityStatus(todayActivity.day, "attended");
                }}
                disabled={!todayActivity}
                className={`min-w-[140px] rounded-xl px-5 py-3 text-lg font-bold transition ${
                  todayActivity?.status === "attended"
                    ? "bg-orange-500 text-white"
                    : "border border-orange-300 bg-white text-orange-800 hover:bg-orange-50"
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
                className={`min-w-[140px] rounded-xl px-5 py-3 text-lg font-bold transition ${
                  todayActivity?.status === "missed"
                    ? "bg-rose-500 text-white"
                    : "border border-rose-300 bg-white text-rose-800 hover:bg-rose-50"
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
                className="min-w-[140px] rounded-xl border border-slate-300 bg-white px-5 py-3 text-lg font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear
              </button>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">Recent activity</h2>
          </div>
          <ul className="mt-3 space-y-1.5">
            {recentActivity.map((entry) => (
              <li key={entry.iso}>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-900 sm:text-sm">
                        {entry.day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      </p>
                      <p className="text-[11px] text-slate-500 sm:text-xs">{entry.planned ? "Planned training day" : "Unplanned day"}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold sm:text-xs ${
                        entry.status === "attended"
                          ? "bg-orange-100 text-orange-800"
                          : entry.status === "missed"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {entry.status === "attended" ? "Attended" : entry.status === "missed" ? "Missed" : "No log"}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-slate-900">Weekly workout plan</h2>
          <span className="text-sm font-medium text-slate-600">{totalWorkouts} workouts planned</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {weekdays.map((day) => {
            const items = plan[day].items.filter((item) => item.exerciseId.trim());
            return (
              <article key={day} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-sm font-semibold text-slate-900">{day}</h3>
                {items.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">Rest day</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-xs text-slate-700">
                    {items.slice(0, 3).map((item) => (
                      <li key={item.id}>
                        {item.preferredExerciseName || item.templateLabel || "Workout"} • {item.sets} sets • {item.reps}
                      </li>
                    ))}
                    {items.length > 3 ? <li className="text-slate-500">+{items.length - 3} more</li> : null}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
