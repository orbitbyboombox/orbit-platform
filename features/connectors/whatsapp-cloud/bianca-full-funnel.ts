import type { FormalQuoteDraft } from "../../commercial-hub/types.ts";
import type { BiancaQuoteExecutionEvidence } from "./bianca-agent-orchestrator.ts";
import type { BiancaEmailEvidence, BiancaEmailInput } from "../google-gmail/application/bianca-email.adapter.ts";
import type { BiancaReservationStartEvidence, BiancaReservationStartInput, BiancaReservationStartResult } from "./bianca-reservation-start.adapter.ts";

export type BiancaFullFunnelInput = {
  quote: { draft: FormalQuoteDraft; customerId: string; conversationId: string; opportunityId: string; normalizedInputHash: string };
  email?: BiancaEmailInput;
  reservation?: BiancaReservationStartInput;
};

export type BiancaFullFunnelDependencies = {
  createQuote(input: BiancaFullFunnelInput["quote"]): Promise<BiancaQuoteExecutionEvidence>;
  sendEmail(input: BiancaEmailInput): Promise<BiancaEmailEvidence>;
  startReservation(input: BiancaReservationStartInput): Promise<BiancaReservationStartResult>;
};

export type BiancaFullFunnelResult = {
  quote: BiancaQuoteExecutionEvidence;
  email: BiancaEmailEvidence | null;
  reservation: BiancaReservationStartResult | null;
};

export async function executeBiancaFullFunnel(input: BiancaFullFunnelInput, dependencies: BiancaFullFunnelDependencies): Promise<BiancaFullFunnelResult> {
  const quote = await dependencies.createQuote(input.quote);
  const email = input.email ? await dependencies.sendEmail(input.email) : null;
  const reservation = input.reservation ? await dependencies.startReservation(input.reservation) : null;
  return { quote, email, reservation };
}

export function reservationEvidenceForClaim(result: BiancaReservationStartResult): BiancaReservationStartEvidence | null {
  return result.status === "NEEDS_INFORMATION" ? null : result;
}
