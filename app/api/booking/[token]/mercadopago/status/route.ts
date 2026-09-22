import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { automaticBookingTokenHash } from "@/features/automatic-booking/automatic-booking.service";
import { completeReconciledMercadoPagoIntent, reconcileMercadoPagoPayment } from "@/features/payments/mercadopago/mercadopago-reconciliation.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const intentId = new URL(request.url).searchParams.get("payment_intent");
  if (!intentId) return NextResponse.json({ ok: false }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("mercado_pago_payment_intents").select("*").eq("id", intentId).eq("token_hash", automaticBookingTokenHash(token)).maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, status: "UNKNOWN" }, { status: 404 });
  if (data.status !== "PAID" && data.status !== "REVIEW_REQUIRED") {
    try {
      const reconciliation = await reconcileMercadoPagoPayment({ admin, intent: data });
      if (reconciliation.outcome === "PAID" && reconciliation.providerPaymentId) {
        await completeReconciledMercadoPagoIntent({ admin, intent: { ...data, status: "PAID", provider_payment_id: reconciliation.providerPaymentId }, providerPaymentId: reconciliation.providerPaymentId, requestMeta: { ipAddress: "mercadopago-return", userAgent: request.headers.get("user-agent") ?? "mercadopago-return" } });
        data.status = "PAID";
        data.provider_payment_id = reconciliation.providerPaymentId;
        data.booking_completed_at = data.booking_completed_at ?? new Date().toISOString();
      }
    } catch (reconciliationError) {
      console.warn(JSON.stringify({ event: "mp.return.reconciliation_failed", intentId, error: reconciliationError instanceof Error ? reconciliationError.message : "unknown" }));
    }
  }
  // The browser may have been away in Checkout Pro long enough for every
  // React state value to be gone. Return only the persisted booking snapshot
  // needed to rebuild the public summary; never return signature/receipt data.
  const persisted = data.submission && typeof data.submission === "object" ? data.submission as Record<string, unknown> : {};
  const payment = persisted.payment && typeof persisted.payment === "object" ? persisted.payment as Record<string, unknown> : {};
  const bookingSnapshot = {
    customer: persisted.customer ?? null,
    event: persisted.event ?? null,
    service: persisted.service ?? null,
    payment: {
      method: "MERCADO_PAGO",
      providerPaymentId: data.provider_payment_id ?? payment.providerPaymentId ?? "",
      externalReference: data.external_reference ?? payment.externalReference ?? "",
    },
  };
  return NextResponse.json({ ok: true, status: data.status, amount: data.amount_total, amountBase: data.amount_base, fee: data.fee_amount, currency: data.currency, bookingCompleted: Boolean(data.booking_completed_at), providerPaymentId: data.provider_payment_id, externalReference: data.external_reference, checkoutUrl: data.checkout_url, bookingSnapshot }, { headers: { "Cache-Control": "no-store" } });
}
