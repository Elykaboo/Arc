"use client";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  void error;

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Something went wrong
        </p>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">We hit an unexpected error.</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          The issue has been contained. Refresh the page or try again in a moment.
        </p>
      </div>

      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        Try again
      </button>
    </main>
  );
}
