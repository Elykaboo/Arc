import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Next.js 14+ Boilerplate
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          TheMind2Muscle Workout Planner
        </h1>
        <p className="text-base text-slate-600 sm:text-lg">
          MVP setup complete. Start from workouts or go straight to weekly
          planning.
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
        <Link
          href="/workouts"
          className="w-full rounded-md bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Go to Workouts
        </Link>
        <Link
          href="/planner"
          className="w-full rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
        >
          Go to Planner
        </Link>
      </div>
    </main>
  );
}
