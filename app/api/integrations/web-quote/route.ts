import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateBoomboxWebLead, type WebLead } from "@/features/commercial-hub/web-lead-intake";

export const runtime = "nodejs";
const safeEqual = (received: string, expected: string) => {
  const a = Buffer.from(received), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

// This ingestion endpoint NEVER sends emails. Automated delivery is a separate, disabled feature.
export async function POST(request: NextRequest) {
  const configured = process.env.ORBIT_WEB_LEAD_INGEST_SECRET;
  const supplied = request.headers.get("x-orbit-web-lead-secret") ?? "";
  if (!configured || !safeEqual(supplied, configured)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (Number(request.headers.get("content-length") ?? "0") > 16000) {
    return NextResponse.json({ ok: false, error: "TOO_LARGE" }, { status: 413 });
  }
  let payload: WebLead;
  try {
    const raw = await request.text();
    if (raw.length > 16000) throw new Error("Payload too large");
    payload = JSON.parse(raw) as WebLead;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_PAYLOAD" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || typeof payload.sourceUrl !== "string" ||
    ["submissionId", "name", "email", "phone", "eventType", "eventDate"].some(key => {
      const value = payload[key as keyof WebLead];
      return value != null && typeof value !== "string";
    })) {
    return NextResponse.json({ ok: false, error: "INVALID_PAYLOAD" }, { status: 400 });
  }
  const decision = evaluateBoomboxWebLead(payload);
  if (!decision.sourceDomain || !decision.dedupeKey || !decision.normalizedEmail) {
    return NextResponse.json({ ok: false, error: decision.reason ?? "UNUSABLE_LEAD" }, { status: 422 });
  }
  const mode = decision.eligible ? "AUTO_DRAFT" : "MANUAL_REVIEW";
  const client = createAdminClient();
  const { data, error } = await client.from("web_quote_intakes").upsert({
    dedupe_key: decision.dedupeKey,
    source_domain: decision.sourceDomain,
    full_name: (payload.name ?? "").trim(),
    email: decision.normalizedEmail,
    phone: (payload.phone ?? "").trim() || null,
    event_type: (payload.eventType ?? "").trim(),
    event_date: (payload.eventDate ?? "").trim(),
    category: decision.category,
    mode,
    status: decision.eligible ? "RECEIVED" : "PENDING_REVIEW",
    raw_payload: payload,
  }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id,status,mode").maybeSingle();
  if (error) {
    console.error("web_quote_intake.failed", { code: error.code });
    return NextResponse.json({ ok: false, error: "STORAGE_FAILED" }, { status: 503 });
  }
  // Existing record is never overwritten, including any SENT state.
  return NextResponse.json({ ok: true, duplicate: !data, status: data?.status ?? "EXISTING", mode: data?.mode ?? mode });
}
