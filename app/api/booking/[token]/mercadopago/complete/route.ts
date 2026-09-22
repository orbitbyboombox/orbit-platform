import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { automaticBookingTokenHash } from "@/features/automatic-booking/automatic-booking.service";
import { completeAutomaticBooking, type AutomaticBookingSubmission } from "@/features/automatic-booking/complete-automatic-booking.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const intentId = (await request.json() as { payment_intent?: string }).payment_intent;
    if (!intentId) return NextResponse.json({ ok: false, code: "PAYMENT_INTENT_REQUIRED" }, { status: 400 });
    const admin = createAdminClient();
    const tokenHash = automaticBookingTokenHash(token);
    const { data: intent, error } = await admin.from("mercado_pago_payment_intents").select("id,status,token_hash,external_reference,provider_payment_id,submission,booking_completed_at").eq("id", intentId).eq("token_hash", tokenHash).maybeSingle();
    if (error) throw error;
    if (!intent || intent.status !== "PAID" || !intent.provider_payment_id || !intent.external_reference) return NextResponse.json({ ok: false, code: "PAYMENT_REQUIRED", status: intent?.status ?? "UNKNOWN" }, { status: 402 });
    const submission = intent.submission as AutomaticBookingSubmission;
    submission.payment = { ...submission.payment, method: "MERCADO_PAGO", providerPaymentId: String(intent.provider_payment_id), externalReference: String(intent.external_reference) };
    const result = await completeAutomaticBooking({ token: "__payment_intent__", tokenHashOverride: tokenHash, submission, ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown", userAgent: request.headers.get("user-agent") ?? "automatic-booking-mercadopago" });
    await admin.from("mercado_pago_payment_intents").update({ booking_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", intent.id).is("booking_completed_at", null);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, code: "BOOKING_COMPLETION_FAILED", message: "No pudimos completar la reserva todavía. Tus datos y pago quedan guardados para reintentar." }, { status: 409 });
  }
}
