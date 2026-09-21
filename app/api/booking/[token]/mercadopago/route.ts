import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { automaticBookingTokenHash } from "@/features/automatic-booking/automatic-booking.service";
import { calculateAutomaticBookingPricing, validateAutomaticBookingSubmission, type AutomaticBookingSubmission } from "@/features/automatic-booking/complete-automatic-booking.service";
import { calculateMercadoPagoAmounts, createMercadoPagoPreference, getMercadoPagoConfig } from "@/features/payments/mercadopago/mercadopago.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const submission = await request.json() as AutomaticBookingSubmission;
    if (submission.payment?.method !== "MERCADO_PAGO") return NextResponse.json({ ok: false, code: "PAYMENT_METHOD_INVALID" }, { status: 400 });
    validateAutomaticBookingSubmission(submission);
    const email = submission.customer?.email?.trim().toLowerCase();
    if (!email) return NextResponse.json({ ok: false, code: "VALIDATION" }, { status: 400 });
    const admin = createAdminClient();
    const tokenHash = automaticBookingTokenHash(token);
    const { data: invitation } = await admin.from("automatic_booking_invitations").select("id,created_by,project_id,payload,status,expires_at,consumed_at,customer_email").eq("token_hash", tokenHash).eq("customer_email", email).maybeSingle();
    if (!invitation || invitation.consumed_at || !invitation.expires_at || new Date(invitation.expires_at).getTime() <= Date.now()) return NextResponse.json({ ok: false, code: "BOOKING_TOKEN_INVALID" }, { status: 400 });
    const { data: activeIntent } = await admin.from("mercado_pago_payment_intents").select("id,external_reference,amount_base,fee_amount,amount_total,checkout_url,status").eq("token_hash", tokenHash).in("status", ["CREATED", "PENDING"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (activeIntent?.checkout_url) return NextResponse.json({ ok: true, paymentIntentId: activeIntent.id, externalReference: activeIntent.external_reference, checkoutUrl: activeIntent.checkout_url, amount: activeIntent.amount_total, subtotal: activeIntent.amount_base, fee: activeIntent.fee_amount, currency: "CLP", reused: true });
    const pricing = await calculateAutomaticBookingPricing(admin, submission);
    // The Checkout Pro amount is the canonical initial reservation amount;
    // the commercial total/balance remain unchanged in ORBIT.
    const amounts = calculateMercadoPagoAmounts(pricing.reservation);
    const intentId = randomUUID();
    const externalReference = `orbit-mp:${intentId}`;
    const { appUrl } = getMercadoPagoConfig();
    const notificationUrl = `${appUrl}/api/payments/mercadopago/webhook`;
    const { error: intentError } = await admin.from("mercado_pago_payment_intents").insert({
      id: intentId,
      token_hash: tokenHash,
      external_reference: externalReference,
      project_id: invitation.project_id,
      reservation_id: invitation.project_id,
      amount_base: amounts.subtotal,
      fee_amount: amounts.fee,
      amount_total: amounts.total,
      currency: "CLP",
      status: "CREATED",
      submission: { ...submission, payment: { ...submission.payment, receiptBase64: "", receiptName: "", receiptType: "" } },
      metadata: { reservation_id: invitation.project_id ?? "", project_id: invitation.project_id ?? "", quotation_id: "", payment_intent_id: intentId, environment: process.env.VERCEL_ENV ?? "development", invitation_id: invitation.id },
    });
    if (intentError) throw intentError;
    const preference = await createMercadoPagoPreference({ externalReference, title: "Abono inicial de reserva BOOMBOX", amount: amounts.total, metadata: { reservation_id: invitation.project_id ?? "", project_id: invitation.project_id ?? "", quotation_id: "", payment_intent_id: intentId, environment: process.env.VERCEL_ENV ?? "development" }, successUrl: `${appUrl}/booking/${encodeURIComponent(token)}?payment=success&payment_intent=${encodeURIComponent(intentId)}`, pendingUrl: `${appUrl}/booking/${encodeURIComponent(token)}?payment=pending&payment_intent=${encodeURIComponent(intentId)}`, failureUrl: `${appUrl}/booking/${encodeURIComponent(token)}?payment=failure&payment_intent=${encodeURIComponent(intentId)}`, notificationUrl });
    await admin.from("mercado_pago_payment_intents").update({ provider_preference_id: preference.id, checkout_url: preference.checkoutUrl, updated_at: new Date().toISOString() }).eq("id", intentId);
    console.info(JSON.stringify({ event: "mp.preference.created", intentId, preferenceId: preference.id, amount: amounts.total, currency: "CLP" }));
    return NextResponse.json({ ok: true, paymentIntentId: intentId, externalReference, checkoutUrl: preference.checkoutUrl, amount: amounts.total, subtotal: amounts.subtotal, fee: amounts.fee, currency: "CLP" });
  } catch (error) {
    console.error(JSON.stringify({ event: "mp.preference.failed", error: error instanceof Error ? error.message : "unknown" }));
    return NextResponse.json({ ok: false, code: "MERCADO_PAGO_PREFERENCE_FAILED", message: "No pudimos preparar el pago con Mercado Pago. Intenta nuevamente." }, { status: 502 });
  }
}
