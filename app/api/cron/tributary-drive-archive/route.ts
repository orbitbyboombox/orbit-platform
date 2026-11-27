import { NextResponse } from "next/server";
import { processTributaryDriveQueue } from "@/features/finance/tributary-drive-queue";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...await processTributaryDriveQueue() });
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo procesar la cola tributaria." }, { status: 500 });
  }
}
