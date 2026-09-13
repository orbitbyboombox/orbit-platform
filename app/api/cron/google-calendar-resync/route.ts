import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncStaleGoogleCalendarEvents } from "@/features/connectors/google-calendar/application/google-calendar-resync.service";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await syncStaleGoogleCalendarEvents({ client: createAdminClient(), actorId: "00000000-0000-0000-0000-000000000000" });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Calendar resync failed" }, { status: 500 });
  }
}
