import { createHash } from "node:crypto";
import type { QuickSendCatalogCategory } from "./catalogs";

export type WebLeadCategory = QuickSendCatalogCategory | "REVIEW";
export type WebLead = {
  sourceUrl: string;
  submissionId?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  eventType?: string | null;
  eventDate?: string | null;
};
export type WebLeadDecision = {
  eligible: boolean;
  category: WebLeadCategory;
  dedupeKey: string | null;
  reason: string | null;
  normalizedEmail: string | null;
  sourceDomain: "bbox.cl" | "boom-box.cl" | null;
};
const clean = (value?: string | null) => (value ?? "").trim();
const fold = (value?: string | null) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const webDomains = new Set(["bbox.cl", "boom-box.cl", "www.bbox.cl", "www.boom-box.cl"]);

export function evaluateBoomboxWebLead(input: WebLead): WebLeadDecision {
  let host = "";
  try {
    const url = new URL(input.sourceUrl);
    if (url.protocol !== "https:") throw new Error("Invalid protocol");
    host = url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return { eligible: false, category: "REVIEW", dedupeKey: null, reason: "INVALID_SOURCE", normalizedEmail: null, sourceDomain: null };
  }
  if (!webDomains.has(host)) return { eligible: false, category: "REVIEW", dedupeKey: null, reason: "UNTRUSTED_SOURCE", normalizedEmail: null, sourceDomain: null };
  const domain = host.endsWith("boom-box.cl") ? "boom-box.cl" : "bbox.cl";
  const email = clean(input.email).toLowerCase();
  const normalizedEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  const text = fold(input.eventType);
  const category: WebLeadCategory = /matrimonio|boda|novios?/.test(text) ? "WEDDINGS"
    : /cumpleanos|birthday/.test(text) ? "BIRTHDAYS"
    : /graduacion|graduados?|licenciatura/.test(text) ? "GRADUATIONS"
    : "REVIEW";
  const submissionId = clean(input.submissionId);
  const identity = submissionId
    ? `web-submission:${submissionId}`
    : `web-lead:${email}:${fold(input.eventType)}:${fold(input.eventDate)}:${fold(input.name)}`;
  // Domain intentionally excluded: two domains may report the same submission.
  const dedupeKey = normalizedEmail ? createHash("sha256").update(identity).digest("hex") : null;
  const reason = !normalizedEmail ? "MISSING_EMAIL"
    : !clean(input.name) ? "MISSING_NAME"
    : /empresa|corporativ|activacion|marca|evento|feria|campana|festival|congreso|seminario/.test(text) ? "MANUAL_COMMERCIAL_REVIEW"
    : category === "REVIEW" ? "UNSUPPORTED_EVENT_TYPE"
    : !clean(input.eventDate) ? "MISSING_EVENT_DATE"
    : null;
  return { eligible: reason === null, category, dedupeKey, reason, normalizedEmail, sourceDomain: domain };
}
