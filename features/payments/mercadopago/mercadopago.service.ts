import { createHmac, timingSafeEqual } from "node:crypto";

export const MERCADO_PAGO_FEE_RATE = 0.05;

export type MercadoPagoStatus =
  | "approved"
  | "pending"
  | "in_process"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "charged_back";

export type MercadoPagoAmounts = {
  subtotal: number;
  fee: number;
  total: number;
};

/** CLP has no decimal subunits. Rounding is explicit and deterministic. */
export function calculateMercadoPagoAmounts(subtotal: number): MercadoPagoAmounts {
  const normalizedSubtotal = Math.max(0, Math.round(Number(subtotal) || 0));
  const fee = Math.round(normalizedSubtotal * MERCADO_PAGO_FEE_RATE);
  return { subtotal: normalizedSubtotal, fee, total: normalizedSubtotal + fee };
}

export function getMercadoPagoConfig() {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://app.bbox.cl").replace(/\/$/, "");
  if (!accessToken) throw new Error("MERCADOPAGO_ACCESS_TOKEN no configurado.");
  return { accessToken, webhookSecret, appUrl, mode: (process.env.MERCADOPAGO_MODE ?? "TEST").toUpperCase() };
}

export async function checkMercadoPagoApiHealth() {
  const config = getMercadoPagoConfig();
  const response = await fetch("https://api.mercadopago.com/users/me", { headers: { Authorization: `Bearer ${config.accessToken}` }, cache: "no-store" });
  return { reachable: response.ok, status: response.status, mode: config.mode, webhookSecretConfigured: Boolean(config.webhookSecret) };
}

export function verifyMercadoPagoSignature(input: {
  signature: string | null;
  requestId: string | null;
  dataId: string;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}) {
  if (!input.signature || !input.requestId || !input.secret || !input.dataId) return false;
  const parts = Object.fromEntries(input.signature.split(",").map((part) => {
    const [key, value] = part.trim().split("=", 2);
    return [key, value];
  }).filter(([key, value]) => key && value));
  const timestamp = Number(parts.ts);
  if (!Number.isFinite(timestamp)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > (input.toleranceSeconds ?? 300)) return false;
  const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${timestamp};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");
  const received = String(parts.v1 ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(received)) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(received, "utf8"));
}

type PreferenceInput = {
  externalReference: string;
  title: string;
  amount: number;
  metadata: Record<string, string>;
  successUrl: string;
  pendingUrl: string;
  failureUrl: string;
  notificationUrl: string;
};

export async function createMercadoPagoPreference(input: PreferenceInput) {
  const { accessToken } = getMercadoPagoConfig();
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ id: input.externalReference, title: input.title, quantity: 1, currency_id: "CLP", unit_price: Math.round(input.amount) }],
      external_reference: input.externalReference,
      metadata: input.metadata,
      back_urls: { success: input.successUrl, pending: input.pendingUrl, failure: input.failureUrl },
      auto_return: "approved",
      notification_url: input.notificationUrl,
    }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as { id?: string; init_point?: string; sandbox_init_point?: string; message?: string };
  if (!response.ok || !body.id) throw new Error(`Mercado Pago preference failed (${response.status}).`);
  return { id: body.id, checkoutUrl: body.sandbox_init_point ?? body.init_point ?? null };
}

export async function fetchMercadoPagoPayment(paymentId: string) {
  const { accessToken } = getMercadoPagoConfig();
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(`Mercado Pago payment verification failed (${response.status}).`);
  return body as {
    id?: number | string;
    status?: MercadoPagoStatus;
    status_detail?: string;
    transaction_amount?: number;
    currency_id?: string;
    external_reference?: string;
    metadata?: Record<string, unknown>;
  };
}

export function mapMercadoPagoStatus(status: string | undefined) {
  switch (status) {
    case "approved": return "PAID" as const;
    case "pending":
    case "in_process": return "PENDING" as const;
    case "rejected":
    case "cancelled": return "FAILED" as const;
    case "refunded": return "REFUNDED" as const;
    case "charged_back": return "CHARGEBACK" as const;
    default: return "REVIEW_REQUIRED" as const;
  }
}
