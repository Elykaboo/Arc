"use client";

import {
  buildDraftFromTemplate,
  plannerStorageKey,
  routineTemplates,
  weekdays,
} from "@/lib/routine-templates";

export default function RoutinesClient() {
  const applyTemplate = (templateId: string) => {
    const template = routineTemplates.find((item) => item.id === templateId);
    if (!template) return;

    const draft = buildDraftFromTemplate(template);
    window.localStorage.setItem(plannerStorageKey, JSON.stringify(draft));
    window.location.assign("/planner");
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Routine Templates</h1>
        <p className="max-w-3xl text-slate-600">
          Popular split templates: PPL, PPL x UL, UL x PPL, Arnold, Full Body, Upper/Lower, Bro,
          Torso/Limbs, and PHUL.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {routineTemplates.map((template) => (
          <article
            key={template.id}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">{template.name}</h2>
              <p className="text-sm text-slate-600">{template.summary}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                {template.daysPerWeek} days
              </span>
              <span
                className={`rounded-full px-2 py-1 ${
                  template.level === "Beginner"
                    ? "bg-emerald-100 text-emerald-800"
                    : template.level === "Intermediate"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-rose-100 text-rose-800"
                }`}
              >
                {template.level}
              </span>
            </div>

            <ul className="space-y-1 text-sm text-slate-700">
              {weekdays.map((day) => (
                <li key={`${template.id}-${day}`}>
                  <span className="font-semibold text-slate-900">{day}:</span>{" "}
                  {template.schedule[day].length
                    ? `${template.schedule[day][0].label} (${template.schedule[day].length} exercises)`
                    : "Rest"}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => applyTemplate(template.id)}
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Apply to Planner
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}
