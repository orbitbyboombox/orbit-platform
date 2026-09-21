import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeAutomaticBooking, type AutomaticBookingSubmission } from "@/features/automatic-booking/complete-automatic-booking.service";
import { fetchMercadoPagoPayment, getMercadoPagoConfig, mapMercadoPagoStatus, verifyMercadoPagoSignature } from "@/features/payments/mercadopago/mercadopago.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  let payload: { type?: string; action?: string; data?: { id?: string | number } } = {};
  try { payload = JSON.parse(rawBody) as typeof payload; } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const dataId = String(payload.data?.id ?? new URL(request.url).searchParams.get("data.id") ?? "");
  let config: ReturnType<typeof getMercadoPagoConfig>;
  try { config = getMercadoPagoConfig(); } catch { return NextResponse.json({ ok: false }, { status: 503 }); }
  if (!config.webhookSecret) return NextResponse.json({ ok: false }, { status: 503 });
  const valid = verifyMercadoPagoSignature({ signature: request.headers.get("x-signature"), requestId: request.headers.get("x-request-id"), dataId, secret: config.webhookSecret });
  if (!valid) {
    console.warn(JSON.stringify({ event: "mp.webhook.invalid_signature", dataId: dataId || "unknown" }));
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  // Acknowledge non-payment notifications without touching the ledger.
  if (payload.type !== "payment" && payload.action !== "payment.created" && payload.action !== "payment.updated") return NextResponse.json({ ok: true });
  if (!dataId) return NextResponse.json({ ok: true });
  const admin = createAdminClient();
  try {
    const payment = await fetchMercadoPagoPayment(dataId);
    const externalReference = payment.external_reference?.trim();
    if (!externalReference) return NextResponse.json({ ok: true });
    const { data: intent, error: intentError } = await admin.from("mercado_pago_payment_intents").select("*").eq("external_reference", externalReference).maybeSingle();
    if (intentError) throw intentError;
    if (!intent) return NextResponse.json({ ok: true });
    const providerAmount = Math.round(Number(payment.transaction_amount ?? 0));
    const expectedAmount = Math.round(Number(intent.amount_total ?? 0));
    const status = mapMercadoPagoStatus(payment.status);
    if (payment.currency_id !== "CLP" || providerAmount !== expectedAmount) {
      await admin.from("mercado_pago_payment_intents").update({ status: "REVIEW_REQUIRED", provider_payment_id: String(payment.id ?? dataId), failure_reason: "Monto o moneda no coincide con la intención canónica.", updated_at: new Date().toISOString() }).eq("id", intent.id);
      console.warn(JSON.stringify({ event: "mp.payment.amount_mismatch", intentId: intent.id, paymentId: String(payment.id ?? dataId), expectedAmount, providerAmount, currency: payment.currency_id ?? null }));
      return NextResponse.json({ ok: true });
    }
    const alreadyProcessed = intent.status === "PAID" && intent.provider_payment_id === String(payment.id ?? dataId) && intent.booking_completed_at;
    if (alreadyProcessed) return NextResponse.json({ ok: true, idempotent: true });
    await admin.from("mercado_pago_payment_intents").update({ status, provider_payment_id: String(payment.id ?? dataId), approved_at: status === "PAID" ? new Date().toISOString() : intent.approved_at, updated_at: new Date().toISOString() }).eq("id", intent.id);
    await admin.from("mercado_pago_transactions").upsert({
      external_id: String(payment.id ?? dataId),
      project_id: intent.project_id ?? null,
      gross_amount: providerAmount,
      fee_amount: Number(intent.fee_amount ?? 0),
      settlement_status: status,
      transfer_status: "PENDING",
      provider_payload: { status: payment.status ?? null, status_detail: payment.status_detail ?? null, currency: payment.currency_id ?? null, external_reference: externalReference },
      updated_at: new Date().toISOString(),
    }, { onConflict: "external_id" });
    console.info(JSON.stringify({ event: "mp.payment.verified", intentId: intent.id, paymentId: String(payment.id ?? dataId), status }));
    if (status !== "PAID") return NextResponse.json({ ok: true, status });
    if (intent.booking_completed_at) return NextResponse.json({ ok: true, idempotent: true });
    const submission = intent.submission as AutomaticBookingSubmission;
    submission.payment = { ...submission.payment, method: "MERCADO_PAGO", providerPaymentId: String(payment.id ?? dataId), externalReference };
    const result = await completeAutomaticBooking({ token: "__payment_intent__", tokenHashOverride: String(intent.token_hash), submission, ipAddress: "mercadopago", userAgent: "mercadopago-webhook" });
    await admin.from("mercado_pago_payment_intents").update({ booking_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", intent.id);
    return NextResponse.json({ ok: true, status, booking: "completed", reservationNumber: "reservationNumber" in result ? result.reservationNumber : null });
  } catch (error) {
    console.error(JSON.stringify({ event: "mp.webhook.processing_failed", dataId, error: error instanceof Error ? error.message : "unknown" }));
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
