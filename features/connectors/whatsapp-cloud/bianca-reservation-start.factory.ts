import "server-only";

import { createAdminClient } from "../../../lib/supabase/admin";
import { createAutomaticBookingInvitation } from "../../automatic-booking/automatic-booking.service";
import { BiancaReservationStartAdapter } from "./bianca-reservation-start.adapter";

export async function createBiancaReservationStartAdapter() {
  const testMode = process.env.ORBIT_ENVIRONMENT === "test" || process.env.VERCEL_ENV === "preview";
  const liveEnabled = process.env.BIANCA_RESERVATION_START_ENABLED?.trim().toLowerCase() === "true";
  const runtimeTest = process.env.BIANCA_RESERVATION_RUNTIME_TEST?.trim().toLowerCase() === "true";
  if (testMode && runtimeTest) {
    return new BiancaReservationStartAdapter(createAdminClient(), async (input) => {
      const result = await createAutomaticBookingInvitation(input.customerEmail!, process.env.BIANCA_TEST_ACTOR_ID ?? input.customerId, { deliveryMode: "SANDBOX" });
      return { reservationId: result.invitationId, url: result.url };
    }, "SANDBOX");
  }
  if (testMode || !liveEnabled) {
    return new BiancaReservationStartAdapter(createAdminClient(), async (input) => ({ reservationId: `mock-reservation:${input.opportunityId}`, url: null }), "MOCK");
  }
  return new BiancaReservationStartAdapter(createAdminClient(), async (input) => {
    const result = await createAutomaticBookingInvitation(input.customerEmail!, input.customerId);
    return { reservationId: result.url, url: result.url };
  }, "LIVE");
}
