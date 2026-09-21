import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { automaticBookingTokenHash } from "@/features/automatic-booking/automatic-booking.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const intentId = new URL(request.url).searchParams.get("payment_intent");
  if (!intentId) return NextResponse.json({ ok: false }, { status: 400 });
  const { data, error } = await createAdminClient().from("mercado_pago_payment_intents").select("status,amount_total,currency,booking_completed_at").eq("id", intentId).eq("token_hash", automaticBookingTokenHash(token)).maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, status: "UNKNOWN" }, { status: 404 });
  return NextResponse.json({ ok: true, status: data.status, amount: data.amount_total, currency: data.currency, bookingCompleted: Boolean(data.booking_completed_at) }, { headers: { "Cache-Control": "no-store" } });
}
