import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMercadoPagoPayment, getMercadoPagoConfig, resolveMercadoPagoDataId, verifyMercadoPagoSignature } from "@/features/payments/mercadopago/mercadopago.service";
import { completeReconciledMercadoPagoIntent, reconcileMercadoPagoPayment } from "@/features/payments/mercadopago/mercadopago-reconciliation.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-signature");
  const requestIdHeader = request.headers.get("x-request-id");
  let payload: { type?: string; action?: string; data?: { id?: string | number } } = {};
  try { payload = JSON.parse(rawBody) as typeof payload; } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const dataIdentity = resolveMercadoPagoDataId({ requestUrl: request.url, payload });
  const dataId = dataIdentity.id;
  const signatureParts = new Map<string, string>(String(signatureHeader ?? "").split(",").flatMap((part) => {
    const [key, ...valueParts] = part.trim().split("=");
    return key && valueParts.length ? [[key, valueParts.join("=")] as [string, string]] : [];
  }));
  console.info(JSON.stringify({
    event: "mp.webhook.received",
    hasSignature: Boolean(signatureHeader),
    hasRequestId: Boolean(requestIdHeader),
    hasTimestamp: Boolean(signatureParts.get("ts")),
    hasV1: Boolean(signatureParts.get("v1")),
    dataIdSource: dataIdentity.source,
    dataIdPresent: Boolean(dataId),
    bodyBytes: rawBody.length,
  }));
  let config: ReturnType<typeof getMercadoPagoConfig>;
  try { config = getMercadoPagoConfig(); } catch { return NextResponse.json({ ok: false }, { status: 503 }); }
  if (!config.webhookSecret) return NextResponse.json({ ok: false }, { status: 503 });
  const valid = verifyMercadoPagoSignature({ signature: signatureHeader, requestId: requestIdHeader, dataId, secret: config.webhookSecret });
  console.info(JSON.stringify({ event: "mp.webhook.signature_checked", signatureMatch: valid, dataIdSource: dataIdentity.source, dataIdPresent: Boolean(dataId) }));
  if (!valid) {
    console.warn(JSON.stringify({ event: "mp.webhook.invalid_signature", dataId: dataId || "unknown" }));
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  // Acknowledge non-payment notifications without touching the ledger.
  if (payload.type !== "payment" && payload.action !== "payment.created" && payload.action !== "payment.updated") return NextResponse.json({ ok: true });
  if (!dataId) return NextResponse.json({ ok: true });
  const admin = createAdminClient();
  try {
    const paymentHint = await fetchMercadoPagoPayment(dataId);
    const externalReference = paymentHint.external_reference?.trim();
    if (!externalReference) return NextResponse.json({ ok: true });
    const { data: intent, error: intentError } = await admin.from("mercado_pago_payment_intents").select("*").eq("external_reference", externalReference).maybeSingle();
    if (intentError) throw intentError;
    if (!intent) return NextResponse.json({ ok: true });
    const reconciliation = await reconcileMercadoPagoPayment({ admin, intent, providerPaymentId: dataId });
    console.info(JSON.stringify({ event: "mp.payment.reconciled", intentId: intent.id, paymentId: reconciliation.providerPaymentId, outcome: reconciliation.outcome }));
    if (reconciliation.outcome !== "PAID" || !reconciliation.providerPaymentId) return NextResponse.json({ ok: true, status: reconciliation.status });
    const result = await completeReconciledMercadoPagoIntent({ admin, intent, providerPaymentId: reconciliation.providerPaymentId, requestMeta: { ipAddress: "mercadopago", userAgent: "mercadopago-webhook" } });
    return NextResponse.json({ ok: true, status: reconciliation.status, booking: "idempotent" in result && result.idempotent ? "idempotent" : "completed", reservationNumber: "reservationNumber" in result ? result.reservationNumber : null });
  } catch (error) {
    console.error(JSON.stringify({ event: "mp.webhook.processing_failed", dataId, error: error instanceof Error ? error.message : "unknown" }));
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
