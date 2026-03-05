import { NextResponse } from "next/server";
import { addLogEntry } from "@/lib/nutrition-tracking-db";
import { normalizeLogEntryPayload } from "@/lib/nutrition-tracking";
import { loadServerUserProfile } from "@/lib/server-profile-db";
import { getAuthenticatedUid } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ date: string }> }) {
  try {
    const uid = await getAuthenticatedUid(request);
    const { date } = await params;
    const profile = await loadServerUserProfile(uid);
    const body = (await request.json()) as Record<string, unknown>;
    const payload = normalizeLogEntryPayload(body);
    const log = await addLogEntry({
      uid,
      date,
      payload,
      mealsPerDay: profile?.mealsPerDay ?? null,
    });
    return NextResponse.json({ log });
  } catch (error) {
    console.error("POST /api/v1/nutrition/logs/[date]/entries failed", error);
    const message = error instanceof Error ? error.message : "Unable to add log entry.";
    const status = /token|bearer/i.test(message) ? 401 : /slot|food|recipe|meal|payload|not found/i.test(message) ? 400 : 500;
    return NextResponse.json({ message }, { status });
  }
}
