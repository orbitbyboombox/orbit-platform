import { NextResponse } from "next/server";
import { AutomaticBookingConfirmationError, completeAutomaticBooking, type AutomaticBookingSubmission } from "@/features/automatic-booking/complete-automatic-booking.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const submission = await request.json() as AutomaticBookingSubmission;
    const result = await completeAutomaticBooking({ token, submission, ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown", userAgent: request.headers.get("user-agent") ?? "unknown" });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[ORBIT][AUTO_BOOKING_CONFIRMATION]", error);
    const failure = error instanceof AutomaticBookingConfirmationError ? error : new AutomaticBookingConfirmationError("VALIDATION", "pending", error);
    return NextResponse.json({ ok: false, message: failure.message, module: failure.module, reservationId: failure.reservationId }, { status: 400 });
  }
}
