import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncStaleGoogleCalendarEvents } from "@/features/connectors/google-calendar/application/google-calendar-resync.service";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const owner = crypto.randomUUID();
  const client = createAdminClient();
  try {
    const { data: acquired, error: leaseError } = await client.rpc("claim_calendar_resync_lease", { p_scope: "google-calendar-resync", p_owner: owner, p_lease_seconds: 300 });
    if (leaseError) throw leaseError;
    if (!acquired) return NextResponse.json({ ok: true, skipped: "LOCKED" }, { status: 202 });
    const result = await syncStaleGoogleCalendarEvents({ client, actorId: "00000000-0000-0000-0000-000000000000", batchSize: 5 });
    console.info("[calendar-resync] authenticated run", result);
    return NextResponse.json({ ok: result.failed === 0, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Calendar resync failed" }, { status: 500 });
  } finally {
    await client.rpc("release_calendar_resync_lease", { p_scope: "google-calendar-resync", p_owner: owner });
  }
}
