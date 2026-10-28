import { NextResponse } from "next/server";
import {
  inspectAutomaticPreEventReminders,
  sendAutomaticPreEventReminders,
} from "@/features/connectors/google-gmail/application/pre-event-reminder.service";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get("dry_run") === "1";
  if (dryRun) {
    if (process.env.VERCEL_ENV === "production" || process.env.D10_DRY_RUN !== "true") {
      return NextResponse.json({ error: "Dry run unavailable" }, { status: 404 });
    }
    const report = await inspectAutomaticPreEventReminders(new Date());
    return NextResponse.json(report, { status: 200 });
  }
  const startedAt = Date.now();
  console.info(JSON.stringify({
    event: "pre_event_reminder.cron_started",
    trigger: "D-10",
  }));
  try {
    const result = await sendAutomaticPreEventReminders(new Date());
    console.info(JSON.stringify({
      event: "pre_event_reminder.cron_completed",
      trigger: "D-10",
      durationMs: Date.now() - startedAt,
      candidates: result.candidates,
      sent: result.sent,
      skipped: result.skipped,
      blocked: result.blocked,
      failed: result.failed,
    }));
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 500 : 200 });
  } catch (error) {
    console.error(JSON.stringify({
      event: "pre_event_reminder.cron_failed",
      trigger: "D-10",
      durationMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : "PreEventReminderCronError",
    }));
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Pre-event D-10 cron failed",
      },
      { status: 500 },
    );
  }
}
