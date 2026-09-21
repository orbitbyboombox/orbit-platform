import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateMercadoPagoAmounts, createMercadoPagoPreference, getMercadoPagoConfig } from "@/features/payments/mercadopago/mercadopago.service";

export const dynamic = "force-dynamic";

const QA_REFERENCE = "orbit-mp:qa-preference:20260921";
const QA_TOKEN_HASH = createHash("sha256").update("orbit-mp-qa-booking-20260921").digest("hex");

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && actual && actual === expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  const amounts = calculateMercadoPagoAmounts(1000);
  const appUrl = getMercadoPagoConfig().appUrl;
  const admin = createAdminClient();
  const existing = await admin.from("mercado_pago_payment_intents")
    .select("id,external_reference,amount_base,fee_amount,amount_total,currency,status,provider_preference_id,checkout_url,metadata")
    .eq("external_reference", QA_REFERENCE).maybeSingle();
  if (existing.error) return NextResponse.json({ ok: false, code: "QA_INTENT_LOOKUP_FAILED" }, { status: 500 });
  if (existing.data?.provider_preference_id && existing.data.checkout_url) {
    return NextResponse.json({ ok: true, reused: true, paymentIntentId: existing.data.id, externalReference: existing.data.external_reference, preferenceId: existing.data.provider_preference_id, checkoutUrl: existing.data.checkout_url, subtotal: existing.data.amount_base, fee: existing.data.fee_amount, amount: existing.data.amount_total, currency: existing.data.currency, status: existing.data.status });
  }
  const intentId = existing.data?.id ?? randomUUID();
  if (!existing.data) {
    const { error } = await admin.from("mercado_pago_payment_intents").insert({
      id: intentId,
      token_hash: QA_TOKEN_HASH,
      external_reference: QA_REFERENCE,
      project_id: null,
      quotation_id: null,
      reservation_id: null,
      amount_base: amounts.subtotal,
      fee_amount: amounts.fee,
      amount_total: amounts.total,
      currency: "CLP",
      status: "CREATED",
      submission: { qa: true, event: "MERCADO_PAGO_PREFERENCE_QA", customer: { email: "mp-qa.invalid@example.invalid" } },
      metadata: { qa: true, environment: "PRODUCTION", booking_token: "QA_HASH_ONLY", source: "founder_cron" },
    });
    if (error) return NextResponse.json({ ok: false, code: "QA_INTENT_CREATE_FAILED" }, { status: 500 });
  }
  const preference = await createMercadoPagoPreference({
    externalReference: QA_REFERENCE,
    title: "QA BOOMBOX — Mercado Pago Checkout",
    amount: amounts.total,
    metadata: { qa: "true", environment: "PRODUCTION", payment_intent_id: intentId },
    successUrl: `${appUrl}/?mp_qa=success`,
    pendingUrl: `${appUrl}/?mp_qa=pending`,
    failureUrl: `${appUrl}/?mp_qa=failure`,
    notificationUrl: `${appUrl}/api/payments/mercadopago/webhook`,
  });
  if (!preference.checkoutUrl) return NextResponse.json({ ok: false, code: "QA_CHECKOUT_URL_MISSING" }, { status: 502 });
  const { error: updateError } = await admin.from("mercado_pago_payment_intents").update({ provider_preference_id: preference.id, checkout_url: preference.checkoutUrl, updated_at: new Date().toISOString() }).eq("id", intentId);
  if (updateError) return NextResponse.json({ ok: false, code: "QA_INTENT_UPDATE_FAILED" }, { status: 500 });
  console.info(JSON.stringify({ event: "mp.preference.created", qa: true, intentId, preferenceId: preference.id, amount: amounts.total, currency: "CLP" }));
  return NextResponse.json({ ok: true, reused: false, paymentIntentId: intentId, externalReference: QA_REFERENCE, preferenceId: preference.id, checkoutUrl: preference.checkoutUrl, subtotal: amounts.subtotal, fee: amounts.fee, amount: amounts.total, currency: "CLP", status: "CREATED" });
}
