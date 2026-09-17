import { NextResponse } from "next/server";
import { processEventDeletionJobs } from "@/features/projects/event-deletion-cleanup.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, results: await processEventDeletionJobs() }); }
  catch (error) { return NextResponse.json({ ok: false, error: { code: "EVENT_DELETION_CLEANUP_FAILED", message: error instanceof Error ? error.message : String(error) } }, { status: 500 }); }
}
