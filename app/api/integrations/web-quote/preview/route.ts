import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { previewAutomaticWebQuoteEmail } from "@/features/commercial-hub/web-quote-premium-preview";
import type { WebLead } from "@/features/commercial-hub/web-lead-intake";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const expected = process.env.ORBIT_WEB_LEAD_INGEST_SECRET;
  const supplied = request.headers.get("x-orbit-web-lead-secret") ?? "";
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  let payload: WebLead;
  try {
    const raw = await request.text();
    if (raw.length > 16000) throw new Error("too large");
    payload = JSON.parse(raw) as WebLead;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_PAYLOAD" }, { status: 400 });
  }
  if (!payload || typeof payload.sourceUrl !== "string" ||
      ["submissionId", "name", "email", "phone", "eventType", "eventDate"].some(key => {
        const value = payload[key as keyof WebLead];
        return value != null && typeof value !== "string";
      })) {
    return NextResponse.json({ ok: false, error: "INVALID_PAYLOAD" }, { status: 400 });
  }
  const preview = previewAutomaticWebQuoteEmail(payload);
  return NextResponse.json(preview, {
    status: preview.ok ? 200 : 422,
    headers: { "Cache-Control": "no-store" },
  });
}
