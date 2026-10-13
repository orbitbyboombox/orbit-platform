import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processPendingCalendarChanges } from "@/features/connectors/google-calendar/application/calendar-change-worker";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...await processPendingCalendarChanges(createAdminClient()) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Calendar sync failed" }, { status: 500 });
  }
}
