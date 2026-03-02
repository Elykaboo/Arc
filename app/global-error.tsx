"use client";

type GlobalErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalErrorPage({ error, reset }: GlobalErrorPageProps) {
  void error;

  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-950 antialiased dark:bg-slate-950 dark:text-slate-100">
        <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Application error
            </p>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">This page is temporarily unavailable.</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              An unexpected error occurred. Please refresh the page or try again shortly.
            </p>
          </div>

          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Retry
          </button>
        </main>
      </body>
    </html>
  );
}
