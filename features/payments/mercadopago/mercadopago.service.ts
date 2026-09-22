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

export function canonicalMercadoPagoMode(value: string | undefined) {
  const mode = (value ?? "").trim().toUpperCase();
  return mode === "PRODUCTION" || mode === "TEST" ? mode : "INVALID";
}

export async function checkMercadoPagoApiHealth() {
  const mode = canonicalMercadoPagoMode(process.env.MERCADOPAGO_MODE);
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  const webhookSecretConfigured = Boolean(process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim());
  const started = Date.now();
  console.info(JSON.stringify({ event: "mp.health.started", mode }));
  if (!accessToken) {
    console.warn(JSON.stringify({ event: "mp.health.failed", reason: "ACCESS_TOKEN_MISSING", mode }));
    return { reachable: false, apiAuth: false, status: null, mode, modeValid: mode !== "INVALID", accessTokenPresent: false, webhookSecretConfigured };
  }
  try {
    const response = await fetch("https://api.mercadopago.com/users/me", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const result = { reachable: response.ok, apiAuth: response.status !== 401 && response.status !== 403 && response.ok, status: response.status, mode, modeValid: mode !== "INVALID", accessTokenPresent: true, webhookSecretConfigured };
    console.info(JSON.stringify({ event: result.reachable ? "mp.health.success" : "mp.health.failed", mode, status: result.status, reachable: result.reachable, elapsedMs: Date.now() - started }));
    return result;
  } catch {
    console.warn(JSON.stringify({ event: "mp.health.failed", reason: "MP_API_UNREACHABLE", mode, elapsedMs: Date.now() - started }));
    return { reachable: false, apiAuth: false, status: null, mode, modeValid: mode !== "INVALID", accessTokenPresent: true, webhookSecretConfigured };
  }
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
  const parts = new Map<string, string>(input.signature.split(",").flatMap((part) => {
    const [key, ...valueParts] = part.trim().split("=");
    return key && valueParts.length ? [[key, valueParts.join("=")] as [string, string]] : [];
  }));
  const timestampValue = parts.get("ts");
  const received = parts.get("v1");
  const timestamp = Number(timestampValue);
  if (!Number.isFinite(timestamp)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > (input.toleranceSeconds ?? 300)) return false;
  const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${timestampValue};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");
  const normalizedReceived = String(received ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedReceived)) return false;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(normalizedReceived, "utf8");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

/** Mercado Pago signs the payment id from the data.id query parameter. Some
 * notification variants only include it in the JSON payload, so use that as
 * a safe fallback; never use the notification envelope id as a payment id. */
export function resolveMercadoPagoDataId(input: {
  requestUrl: string;
  payload?: { data?: { id?: string | number } } | null;
}) {
  const queryId = new URL(input.requestUrl).searchParams.get("data.id")?.trim();
  if (queryId) return { id: queryId, source: "QUERY" as const };
  const bodyId = input.payload?.data?.id;
  return bodyId === undefined || bodyId === null || String(bodyId).trim() === ""
    ? { id: "", source: "ABSENT" as const }
    : { id: String(bodyId).trim(), source: "BODY" as const };
}

export function extractMercadoPagoDataId(input: {
  requestUrl: string;
  payload?: { data?: { id?: string | number } } | null;
}) {
  return resolveMercadoPagoDataId(input).id;
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
  const { accessToken, mode } = getMercadoPagoConfig();
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
  const checkoutUrl = mode === "TEST"
    ? body.sandbox_init_point ?? body.init_point ?? null
    : body.init_point ?? body.sandbox_init_point ?? null;
  return { id: body.id, checkoutUrl };
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
