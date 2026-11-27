import { NextResponse } from "next/server";
import { processTributaryDriveQueue } from "@/features/finance/tributary-drive-queue";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.TRIBUTARY_DRIVE_ARCHIVE_ENABLED !== "true") {
    return NextResponse.json({ ok: true, enabled: false, selected: 0, archived: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await processTributaryDriveQueue();
    console.info("[tributary-drive-archive] authenticated run", result);
    return NextResponse.json({ ok: true, enabled: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo procesar la cola tributaria." }, { status: 500 });
  }
}
