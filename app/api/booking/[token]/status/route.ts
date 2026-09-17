import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { automaticBookingTokenHash } from "@/features/automatic-booking/automatic-booking.service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin.from("automatic_booking_invitations").select("status,state,failure_stage,payload").eq("token_hash", automaticBookingTokenHash(token)).maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, code: "BOOKING_TOKEN_INVALID" }, { status: 404 });
  const payload = data.payload && typeof data.payload === "object" ? data.payload as Record<string, unknown> : {};
  return NextResponse.json({ ok: true, status: data.status, state: data.state, stage: data.failure_stage ?? (typeof payload.state === "string" ? payload.state : null) });
}
