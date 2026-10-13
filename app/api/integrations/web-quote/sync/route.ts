import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateBoomboxWebLead } from "@/features/commercial-hub/web-lead-intake";
import { BOOMBOX_WIX_QUOTE_FORM_ID, mapBoomboxWixQuoteSubmission } from "@/features/commercial-hub/wix-web-quote-mapper";

export const runtime = "nodejs";
type WixRecord = { id?: string; formId?: string; submissions?: Record<string, unknown> };
type WixQuery = { submissions?: WixRecord[]; metadata?: { hasNext?: boolean } };

export async function POST(request: NextRequest) {
  const secret = process.env.ORBIT_WEB_LEAD_INGEST_SECRET;
  const provided = request.headers.get("x-orbit-web-lead-secret") ?? "";
  if (!secret || Buffer.byteLength(secret) !== Buffer.byteLength(provided) ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  // Explicitly limited to 100 newest submissions; replay is harmless due to dedupe_key.
  // Configure a Wix OAuth bearer token with form-submission read permission. No email sending.
  const wixToken = process.env.ORBIT_WIX_FORMS_ACCESS_TOKEN;
  if (!wixToken) return NextResponse.json({ ok: false, error: "WIX_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  let wixResponse: Response;
  try {
    wixResponse = await fetch("https://www.wixapis.com/form-submission-service/v4/submissions/namespace/query", {
      method: "POST",
      headers: { Authorization: wixToken, "Content-Type": "application/json" },
      body: JSON.stringify({ query: {
        filter: { formId: BOOMBOX_WIX_QUOTE_FORM_ID, namespace: "wix.form_app.form" },
        sort: [{ fieldName: "createdDate", order: "DESC" }],
        paging: { limit: 100 },
      } }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "WIX_UNREACHABLE" }, { status: 502 });
  }
  if (!wixResponse.ok) {
    return NextResponse.json({ ok: false, error: "WIX_QUERY_FAILED", httpStatus: wixResponse.status }, { status: 502 });
  }
  const wix = (await wixResponse.json()) as WixQuery;
  if (!Array.isArray(wix.submissions)) {
    return NextResponse.json({ ok: false, error: "WIX_RESPONSE_INVALID" }, { status: 502 });
  }
  const db = createAdminClient();
  let inserted = 0, duplicates = 0, skipped = 0, failed = 0;
  for (const submission of wix.submissions) {
    const lead = mapBoomboxWixQuoteSubmission(submission);
    if (!lead) { skipped++; continue; }
    const decision = evaluateBoomboxWebLead(lead);
    if (!decision.dedupeKey || !decision.normalizedEmail || !decision.sourceDomain) { skipped++; continue; }
    const { data, error } = await db.from("web_quote_intakes").upsert({
      dedupe_key: decision.dedupeKey,
      source_domain: decision.sourceDomain,
      full_name: lead.name || "",
      email: decision.normalizedEmail,
      phone: lead.phone || null,
      event_type: lead.eventType || "",
      event_date: lead.eventDate || "",
      category: decision.category,
      mode: decision.eligible ? "AUTO_DRAFT" : "MANUAL_REVIEW",
      status: decision.eligible ? "RECEIVED" : "PENDING_REVIEW",
      raw_payload: lead,
    }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id").maybeSingle();
    if (error) { failed++; continue; }
    if (data) inserted++; else duplicates++;
  }
  return NextResponse.json({ ok: failed === 0, inserted, duplicates, skipped, failed,
    truncated: Boolean(wix.metadata?.hasNext), deliveryEnabled: false },
    { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
