import type { FormalQuoteDraft } from "../../commercial-hub/types.ts";
import type { BiancaQuoteExecutionEvidence } from "./bianca-agent-orchestrator.ts";
import type { BiancaEmailEvidence, BiancaEmailInput } from "../google-gmail/application/bianca-email.adapter.ts";
import type { BiancaReservationStartEvidence, BiancaReservationStartInput, BiancaReservationStartResult } from "./bianca-reservation-start.adapter.ts";
import { transitionBiancaStage, type BiancaStateTransition } from "./bianca-sales-state-machine.ts";

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
  correlation: {
    conversationId: string;
    opportunityId: string;
    actionRunId: string;
    quoteId: string | null;
    emailRef: string | null;
    reservationId: string | null;
  };
  stateTransitions: BiancaStateTransition[];
};

export type BiancaFullFunnelFailure = {
  failedAt: "QUOTE_CREATE" | "SEND_EMAIL" | "RESERVATION_START";
  error: string;
  partial: Omit<BiancaFullFunnelResult, "stateTransitions">;
  stateTransitions: BiancaStateTransition[];
};

function funnelTransitions(input: BiancaFullFunnelInput, quote: BiancaQuoteExecutionEvidence, email: BiancaEmailEvidence | null, reservation: BiancaReservationStartResult | null) {
  const transitions: BiancaStateTransition[] = [
    transitionBiancaStage({ from: "NEW_LEAD", to: "QUALIFYING", reason: "Lead TEST qualified with known customer and event context.", source: "CUSTOMER" }),
    transitionBiancaStage({ from: "QUALIFYING", to: "QUOTING", reason: "QUOTE_CREATE requested by the active opportunity.", source: "PLANNER" }),
    transitionBiancaStage({ from: "QUOTING", to: "QUOTE_SENT", reason: email ? "Quote evidence and email evidence are available." : "Quote evidence is available.", source: "ACTION" }),
  ];
  if (reservation && reservation.status !== "NEEDS_INFORMATION") {
    transitions.push(transitionBiancaStage({ from: "QUOTE_SENT", to: "RESERVATION_INTENT", reason: "Customer explicitly requested reservation.", source: "CUSTOMER" }));
    transitions.push(transitionBiancaStage({ from: "RESERVATION_INTENT", to: "RESERVATION_STARTED", reason: "Reservation evidence is persisted.", source: "ACTION" }));
  }
  void input; void quote;
  return transitions;
}

export async function executeBiancaFullFunnel(input: BiancaFullFunnelInput, dependencies: BiancaFullFunnelDependencies): Promise<BiancaFullFunnelResult> {
  const quote = await dependencies.createQuote(input.quote);
  const email = input.email ? await dependencies.sendEmail(input.email) : null;
  const reservation = input.reservation ? await dependencies.startReservation(input.reservation) : null;
  return buildFullFunnelResult(input, quote, email, reservation);
}

function buildFullFunnelResult(input: BiancaFullFunnelInput, quote: BiancaQuoteExecutionEvidence, email: BiancaEmailEvidence | null, reservation: BiancaReservationStartResult | null): BiancaFullFunnelResult {
  const reservationEvidence = reservation && reservation.status !== "NEEDS_INFORMATION" ? reservation : null;
  return {
    quote,
    email,
    reservation,
    correlation: {
      conversationId: input.quote.conversationId,
      opportunityId: input.quote.opportunityId,
      actionRunId: reservationEvidence?.actionRunId ?? email?.actionRunId ?? quote.actionRunId,
      quoteId: quote.quotationId ?? null,
      emailRef: email?.providerMessageId ?? null,
      reservationId: reservationEvidence?.reservationId ?? null,
    },
    stateTransitions: funnelTransitions(input, quote, email, reservation),
  };
}

export async function executeBiancaFullFunnelSafely(input: BiancaFullFunnelInput, dependencies: BiancaFullFunnelDependencies): Promise<BiancaFullFunnelResult | BiancaFullFunnelFailure> {
  let quote: BiancaQuoteExecutionEvidence;
  try {
    quote = await dependencies.createQuote(input.quote);
  } catch (error) {
    return { failedAt: "QUOTE_CREATE", error: error instanceof Error ? error.message : String(error), partial: { quote: null as never, email: null, reservation: null, correlation: { conversationId: input.quote.conversationId, opportunityId: input.quote.opportunityId, actionRunId: null as never, quoteId: null, emailRef: null, reservationId: null } }, stateTransitions: [] };
  }
  let email: BiancaEmailEvidence | null = null;
  if (input.email) {
    try { email = await dependencies.sendEmail(input.email); }
    catch (error) {
      return {
        failedAt: "SEND_EMAIL",
        error: error instanceof Error ? error.message : String(error),
        partial: { quote, email: null, reservation: null, correlation: { conversationId: input.quote.conversationId, opportunityId: input.quote.opportunityId, actionRunId: quote.actionRunId, quoteId: quote.quotationId, emailRef: null, reservationId: null } },
        stateTransitions: funnelTransitions(input, quote, null, null),
      };
    }
  }
  let reservation: BiancaReservationStartResult | null = null;
  if (input.reservation) {
    try { reservation = await dependencies.startReservation(input.reservation); }
    catch (error) {
      return {
        failedAt: "RESERVATION_START",
        error: error instanceof Error ? error.message : String(error),
        partial: { quote, email, reservation: null, correlation: { conversationId: input.quote.conversationId, opportunityId: input.quote.opportunityId, actionRunId: email?.actionRunId ?? quote.actionRunId, quoteId: quote.quotationId, emailRef: email?.providerMessageId ?? null, reservationId: null } },
        stateTransitions: funnelTransitions(input, quote, email, null),
      };
    }
  }
  return buildFullFunnelResult(input, quote, email, reservation);
}

export function reservationEvidenceForClaim(result: BiancaReservationStartResult): BiancaReservationStartEvidence | null {
  return result.status === "NEEDS_INFORMATION" ? null : result;
}
