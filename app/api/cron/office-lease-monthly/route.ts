import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const started = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
    const { data, error } = await createAdminClient().rpc("ensure_office_lease_obligations", { p_through_month: today });
    if (error) throw error;
    console.info(JSON.stringify({ level: "info", event: "office_rent_monthly_obligation_done", created: Number(data ?? 0), ms: Date.now() - started }));
    return NextResponse.json({ ok: true, created: Number(data ?? 0), month: today.slice(0, 7) });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "office_rent_monthly_obligation_failed", error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }));
    return NextResponse.json({ ok: false, error: "No fue posible crear la obligación mensual." }, { status: 500 });
  }
}
