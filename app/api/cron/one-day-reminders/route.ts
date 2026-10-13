import { NextResponse } from "next/server";
import { sendAutomaticOneDayReminders } from "@/features/connectors/google-gmail/application/one-day-reminder.service";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await sendAutomaticOneDayReminders(new Date());
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 500 : 200 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "24-hour reminder cron failed" }, { status: 500 });
  }
}
