import "server-only";

import { completeAutomaticBooking, type AutomaticBookingSubmission } from "@/features/automatic-booking/complete-automatic-booking.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMercadoPagoPayment, mapMercadoPagoStatus, searchMercadoPagoPayments } from "./mercadopago.service";

type AdminClient = ReturnType<typeof createAdminClient>;

export type MercadoPagoIntentForReconciliation = {
  id: string;
  token_hash: string;
  status: string | null;
  amount_total: number | string;
  fee_amount: number | string;
  external_reference: string;
  provider_payment_id?: string | null;
  approved_at?: string | null;
  booking_completed_at?: string | null;
  submission: AutomaticBookingSubmission;
  project_id?: string | null;
};

export type MercadoPagoReconciliationResult = {
  outcome: "PAID" | "PENDING" | "FAILED" | "REVIEW_REQUIRED" | "NOT_FOUND";
  providerPaymentId: string | null;
  status: ReturnType<typeof mapMercadoPagoStatus> | null;
  statusDetail: string | null;
  amountValid: boolean;
  currencyValid: boolean;
  externalReferenceValid: boolean;
};

export async function reconcileMercadoPagoPayment(input: {
  admin: AdminClient;
  intent: MercadoPagoIntentForReconciliation;
  providerPaymentId?: string | null;
}): Promise<MercadoPagoReconciliationResult> {
  const payment = input.providerPaymentId
    ? await fetchMercadoPagoPayment(input.providerPaymentId)
    : (await searchMercadoPagoPayments(input.intent.external_reference)).find((candidate) => candidate.external_reference === input.intent.external_reference);
  if (!payment) return { outcome: "NOT_FOUND", providerPaymentId: null, status: null, statusDetail: null, amountValid: false, currencyValid: false, externalReferenceValid: false };
  const providerPaymentId = String(payment.id ?? input.providerPaymentId ?? "");
  const amountValid = Math.round(Number(payment.transaction_amount ?? 0)) === Math.round(Number(input.intent.amount_total ?? 0));
  const currencyValid = payment.currency_id === "CLP";
  const externalReferenceValid = payment.external_reference === input.intent.external_reference;
  const status = mapMercadoPagoStatus(payment.status);
  const statusDetail = payment.status_detail ?? null;
  if (!amountValid || !currencyValid || !externalReferenceValid) {
    await input.admin.from("mercado_pago_payment_intents").update({ status: "REVIEW_REQUIRED", provider_payment_id: providerPaymentId || null, failure_reason: "Monto, moneda o referencia no coincide con la intención canónica.", updated_at: new Date().toISOString() }).eq("id", input.intent.id);
    return { outcome: "REVIEW_REQUIRED", providerPaymentId: providerPaymentId || null, status, statusDetail, amountValid, currencyValid, externalReferenceValid };
  }
  await input.admin.from("mercado_pago_payment_intents").update({ status, provider_payment_id: providerPaymentId || null, approved_at: status === "PAID" ? (input.intent.approved_at ?? new Date().toISOString()) : input.intent.approved_at, updated_at: new Date().toISOString() }).eq("id", input.intent.id);
  await input.admin.from("mercado_pago_transactions").upsert({ external_id: providerPaymentId, project_id: input.intent.project_id ?? null, gross_amount: Math.round(Number(payment.transaction_amount ?? 0)), fee_amount: Number(input.intent.fee_amount ?? 0), settlement_status: status, transfer_status: "PENDING", provider_payload: { status: payment.status ?? null, status_detail: statusDetail, currency: payment.currency_id ?? null, external_reference: input.intent.external_reference }, updated_at: new Date().toISOString() }, { onConflict: "external_id" });
  return { outcome: status === "PAID" ? "PAID" : status === "FAILED" ? "FAILED" : "PENDING", providerPaymentId: providerPaymentId || null, status, statusDetail, amountValid, currencyValid, externalReferenceValid };
}

export async function completeReconciledMercadoPagoIntent(input: {
  admin: AdminClient;
  intent: MercadoPagoIntentForReconciliation;
  providerPaymentId: string;
  requestMeta?: { ipAddress?: string; userAgent?: string };
}) {
  if (input.intent.booking_completed_at) return { idempotent: true as const };
  const submission = input.intent.submission;
  submission.payment = { ...submission.payment, method: "MERCADO_PAGO", providerPaymentId: input.providerPaymentId, externalReference: input.intent.external_reference };
  const result = await completeAutomaticBooking({ token: "__payment_intent__", tokenHashOverride: input.intent.token_hash, submission, ipAddress: input.requestMeta?.ipAddress ?? "mercadopago-reconciliation", userAgent: input.requestMeta?.userAgent ?? "mercadopago-reconciliation" });
  await input.admin.from("mercado_pago_payment_intents").update({ booking_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", input.intent.id).is("booking_completed_at", null);
  return result;
}
