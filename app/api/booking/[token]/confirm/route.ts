import { NextResponse } from "next/server";
import { AutomaticBookingConfirmationError, completeAutomaticBooking, type AutomaticBookingSubmission } from "@/features/automatic-booking/complete-automatic-booking.service";
import { serializeWhatsAppError } from "@/features/connectors/whatsapp-cloud/whatsapp-observability";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const submission = await request.json() as AutomaticBookingSubmission;
    const result = await completeAutomaticBooking({ token, submission, ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown", userAgent: request.headers.get("user-agent") ?? "unknown" });
    return NextResponse.json({ ok: true, ...( "alreadyConfirmed" in result && result.alreadyConfirmed ? { code: "BOOKING_ALREADY_CONFIRMED" } : {}), ...result });
  } catch (error) {
    const failure = error instanceof AutomaticBookingConfirmationError
      ? error
      : new AutomaticBookingConfirmationError("VALIDATION", "pending", error, error instanceof Error && error.message === "BOOKING_IN_PROGRESS" ? "BOOKING_IN_PROGRESS" : "INTERNAL_BOOKING_ERROR");
    console.error(JSON.stringify({ level: "error", event: "automatic_booking.confirmation_request_failed", requestId: failure.requestId, stage: failure.module, code: failure.code, reservationId: failure.reservationId, error: serializeWhatsAppError(failure.cause) }));
    const status = failure.code === "CAPACITY_UNAVAILABLE" || failure.code === "BOOKING_IN_PROGRESS" ? 409 : failure.code === "BOOKING_ALREADY_CONFIRMED" ? 200 : 400;
    return NextResponse.json({ ok: false, message: failure.message, code: failure.code, stage: failure.module, requestId: failure.requestId, reservationId: failure.reservationId }, { status });
  }
}
