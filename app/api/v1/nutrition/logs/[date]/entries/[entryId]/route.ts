import { NextResponse } from "next/server";
import { deleteLogEntry, updateLogEntry } from "@/lib/nutrition-tracking-db";
import { normalizeUpdateLogEntryPayload } from "@/lib/nutrition-tracking";
import { loadServerUserProfile } from "@/lib/server-profile-db";
import { getAuthenticatedUid } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ date: string; entryId: string }> },
) {
  try {
    const uid = await getAuthenticatedUid(request);
    const { date, entryId } = await params;
    const profile = await loadServerUserProfile(uid);
    const body = (await request.json()) as Record<string, unknown>;
    const payload = normalizeUpdateLogEntryPayload(body);
    const log = await updateLogEntry({
      uid,
      date,
      entryId,
      payload,
      mealsPerDay: profile?.mealsPerDay ?? null,
    });
    return NextResponse.json({ log });
  } catch (error) {
    console.error("PATCH /api/v1/nutrition/logs/[date]/entries/[entryId] failed", error);
    const message = error instanceof Error ? error.message : "Unable to update log entry.";
    const status = /token|bearer/i.test(message) ? 401 : /slot|entry|not found/i.test(message) ? 400 : 500;
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ date: string; entryId: string }> },
) {
  try {
    const uid = await getAuthenticatedUid(request);
    const { date, entryId } = await params;
    const profile = await loadServerUserProfile(uid);
    const log = await deleteLogEntry({
      uid,
      date,
      entryId,
      mealsPerDay: profile?.mealsPerDay ?? null,
    });
    return NextResponse.json({ log });
  } catch (error) {
    console.error("DELETE /api/v1/nutrition/logs/[date]/entries/[entryId] failed", error);
    const message = error instanceof Error ? error.message : "Unable to delete log entry.";
    const status = /token|bearer/i.test(message) ? 401 : /entry|not found/i.test(message) ? 400 : 500;
    return NextResponse.json({ message }, { status });
  }
}
