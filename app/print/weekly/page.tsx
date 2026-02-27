"use client";

export default function PrintWeeklyPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10 print:max-w-none print:px-0 print:py-0">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Weekly Plan Print View</h1>
        <p className="text-slate-600">Use this page to generate a PDF via browser print.</p>
      </header>

      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white print:hidden"
      >
        Print / Save as PDF
      </button>
    </main>
  );
}
