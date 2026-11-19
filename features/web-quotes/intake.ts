import { timingSafeEqual } from "node:crypto";

export class QuoteError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
export type QuotePayload = {
  solicitudId: string; nombre: string; telefono: string; correo: string; tipo: string;
  fecha: string | null; lugarEvento: string; mensaje: string; servicio: string;
  horario: string; paginaOrigen: string; viewport: string;
  attribution: Record<string, string>;
};
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
export const ATTRIBUTION_KEYS = ["gclid", "gbraid", "wbraid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id"] as const;
export function normalizeQuote(input: unknown): QuotePayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new QuoteError("INVALID_QUOTE");
  const x = input as Record<string, unknown>;
  const attribution = x.attribution && typeof x.attribution === "object" ? x.attribution as Record<string, unknown> : {};
  const quote: QuotePayload = {
    solicitudId: text(x.solicitudId, 120), nombre: text(x.nombre, 160), telefono: text(x.telefono, 40),
    correo: text(x.correo, 320), tipo: text(x.tipo, 120), fecha: text(x.fecha, 10) || null,
    lugarEvento: text(x.lugarEvento, 240), mensaje: text(x.mensaje, 2000), servicio: text(x.servicio, 160),
    horario: text(x.horario, 80), paginaOrigen: text(x.paginaOrigen, 80).toLowerCase(), viewport: text(x.viewport, 80),
    attribution: Object.fromEntries(ATTRIBUTION_KEYS.map(key => [key, text(attribution[key] ?? x[key], 500)])),
  };
  if (!/^[a-zA-Z0-9_-]{16,120}$/.test(quote.solicitudId)) throw new QuoteError("INVALID_REQUEST_ID");
  if (!quote.nombre || !quote.tipo) throw new QuoteError("REQUIRED_FIELDS");
  if (!/^\+[0-9]{7,15}$/.test(quote.telefono)) throw new QuoteError("INVALID_PHONE");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quote.correo)) throw new QuoteError("INVALID_EMAIL");
  if (quote.fecha && (!/^\d{4}-\d{2}-\d{2}$/.test(quote.fecha) || !Number.isFinite(Date.parse(quote.fecha)) || new Date(quote.fecha).toISOString().slice(0, 10) !== quote.fecha)) throw new QuoteError("INVALID_DATE");
  if (!["home", "matrimonios", "empresas", "descubre", "eventos"].includes(quote.paginaOrigen)) throw new QuoteError("INVALID_PAGE");
  return quote;
}
export type NotificationState = "PENDING" | "SENDING" | "ACCEPTED" | "FAILED" | "UNKNOWN";
export type PersistedQuote = { solicitudId: string; notificationStatus: NotificationState; duplicate: boolean };
export interface QuoteStore {
  persist(quote: QuotePayload, isTest: boolean): Promise<PersistedQuote>;
  claim(id: string): Promise<boolean>;
  complete(id: string, state: "ACCEPTED" | "FAILED" | "UNKNOWN", providerId?: string, errorCode?: string): Promise<void>;
}
export type NotificationResult = { state: "ACCEPTED" | "FAILED" | "UNKNOWN"; providerId?: string; errorCode?: string };
export interface IntakeDependencies {
  token?: string; isTest: boolean; emailEnabled: boolean; store: QuoteStore;
  notify(quote: QuotePayload): Promise<NotificationResult>;
}
export function authorized(header: string | null, token?: string) {
  if (!token || token.length < 32 || !header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7)); const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function acceptWebQuote(request: Request, deps: IntakeDependencies): Promise<Response> {
  if (!deps.token || deps.token.length < 32) return json({ ok: false, code: "INTAKE_NOT_CONFIGURED" }, 503);
  if (!authorized(request.headers.get("authorization"), deps.token)) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return json({ ok: false, code: "INVALID_CONTENT_TYPE" }, 415);
  if (Number(request.headers.get("content-length")) > 16384) return json({ ok: false, code: "PAYLOAD_TOO_LARGE" }, 413);
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 16384) return json({ ok: false, code: "PAYLOAD_TOO_LARGE" }, 413);
    let input: unknown;
    try { input = JSON.parse(raw); } catch { throw new QuoteError("INVALID_JSON"); }
    const quote = normalizeQuote(input);
    const stored = await deps.store.persist(quote, deps.isTest);
    let notificationStatus = stored.notificationStatus;
    let claimed = false;
    if (deps.emailEnabled) {
      try { claimed = await deps.store.claim(quote.solicitudId); }
      catch { notificationStatus = "UNKNOWN"; }
    }
    if (claimed) {
      // The durable claim is never automatically released: an ambiguous send must
      // be reconciled, not blindly retried (Gmail send has no idempotency key).
      notificationStatus = "UNKNOWN";
      let result: NotificationResult;
      try { result = await deps.notify(quote); }
      catch { result = { state: "UNKNOWN", errorCode: "NOTIFICATION_UNCERTAIN" }; }
      try {
        await deps.store.complete(quote.solicitudId, result.state, result.providerId, result.errorCode);
        notificationStatus = result.state;
      } catch { /* persisted lead remains recoverable; SENDING requires reconciliation */ }
    }
    return json({ ok: true, persisted: true, solicitudId: stored.solicitudId, duplicate: stored.duplicate, notificationStatus, conversionEligible: !deps.isTest });
  } catch (error) {
    if (error instanceof QuoteError) return json({ ok: false, code: error.code }, error.status);
    // No raw exception/body, contact details, or credentials in the response/log.
    return json({ ok: false, code: "QUOTE_PERSISTENCE_UNAVAILABLE" }, 503);
  }
}
