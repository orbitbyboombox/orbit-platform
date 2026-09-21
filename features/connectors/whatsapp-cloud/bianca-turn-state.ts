import type { BiancaMessageSource, BiancaWebLeadContext } from "@/features/nova-channel";
import type { BiancaSafeReplyEvidence } from "./bianca-safe-reply";
import type { WhatsAppAiDecision } from "./whatsapp-ai.responder";

export type BiancaRuntimeAction =
  | "RESPOND_GENERAL" | "ASK_MISSING_FIELD" | "RECOMMEND_SERVICE" | "EXPLAIN_SERVICE"
  | "SEND_CATALOG_LINK" | "LOOKUP_PRICE" | "LOOKUP_AVAILABILITY" | "EXPLAIN_PAYMENT"
  | "EXPLAIN_LOCATION" | "WAIT_FOR_CUSTOMER" | "HUMAN_HANDOFF" | "QUOTE_CREATE"
  | "RESERVATION_START" | "SEND_EMAIL" | "APPLY_DISCOUNT" | "PAYMENT_CONFIRM" | "CONTRACT_CHANGE";

export interface BiancaTurnState {
  conversationId: string;
  customerId: string;
  opportunityId: string;
  source: BiancaMessageSource;
  currentIntent: readonly string[];
  eventType?: string;
  eventDate?: string;
  location?: string;
  attendees?: number;
  serviceInterest: readonly string[];
  duration?: number;
  buyingSignal?: string;
  commercialStage?: string;
  missingFields: readonly string[];
  activeHumanTakeover: boolean;
  requestedAction: BiancaRuntimeAction;
  evidence?: BiancaSafeReplyEvidence;
  confidence: number;
}

export function runtimeActionForDecision(decision: WhatsAppAiDecision): BiancaRuntimeAction {
  if (decision.requestedAction === "HUMAN_HANDOFF" || decision.requestedAction === "MANUAL_REVIEW") return "HUMAN_HANDOFF";
  if (decision.requestedAction === "CATALOG_LOOKUP") return "SEND_CATALOG_LINK";
  if (decision.requestedAction === "COMMERCIAL_LOOKUP") {
    if (decision.intents.includes("PAGO")) return "EXPLAIN_PAYMENT";
    if (decision.intents.includes("DISPONIBILIDAD")) return "LOOKUP_AVAILABILITY";
    if (decision.intents.includes("CONSULTA_PRECIO")) return "LOOKUP_PRICE";
    return "RESPOND_GENERAL";
  }
  if (decision.requestedAction === "WAIT_FOR_CUSTOMER" || decision.waitForMoreData) return "ASK_MISSING_FIELD";
  if (decision.intents.includes("RECOMENDACION")) return "RECOMMEND_SERVICE";
  return "RESPOND_GENERAL";
}

export function normalizeBiancaTurnState(input: {
  conversationId: string;
  customerId: string;
  opportunityId?: string;
  source?: BiancaMessageSource;
  decision: WhatsAppAiDecision;
  memory?: { eventType?: string; eventDate?: string; eventLocation?: string; estimatedGuests?: number; selectedService?: string; selectedServices?: readonly string[]; recommendedHours?: number };
  leadContext?: BiancaWebLeadContext;
  activeHumanTakeover?: boolean;
  evidence?: BiancaSafeReplyEvidence;
  confidence?: number;
}): BiancaTurnState {
  const lead = input.leadContext;
  const location = [lead?.venue, lead?.commune].filter(Boolean).join(", ") || input.memory?.eventLocation;
  const fields = input.decision.fields;
  const get = (name: string) => [...fields].reverse().find((field) => field.field === name)?.value;
  const serviceInterest = lead?.message ? (input.memory?.selectedServices ?? (input.memory?.selectedService ? [input.memory.selectedService] : [])) : (input.memory?.selectedServices ?? (input.memory?.selectedService ? [input.memory.selectedService] : []));
  return {
    conversationId: input.conversationId,
    customerId: input.customerId,
    opportunityId: input.opportunityId ?? "",
    source: input.source ?? "DIRECT_WHATSAPP",
    currentIntent: input.decision.intents,
    eventType: lead?.eventType ?? input.memory?.eventType ?? (typeof get("eventType") === "string" ? get("eventType") as string : undefined),
    eventDate: lead?.eventDate ?? input.memory?.eventDate ?? (typeof get("eventDate") === "string" ? get("eventDate") as string : undefined),
    location,
    attendees: input.memory?.estimatedGuests ?? (typeof get("attendees") === "number" ? get("attendees") as number : undefined),
    serviceInterest,
    duration: input.memory?.recommendedHours ?? (typeof get("durationHours") === "number" ? get("durationHours") as number : undefined),
    commercialStage: input.decision.commercialStage,
    missingFields: fields.filter((field) => field.confidence !== "CONFIRMED").map((field) => field.field),
    activeHumanTakeover: input.activeHumanTakeover === true,
    requestedAction: runtimeActionForDecision(input.decision),
    evidence: input.evidence,
    confidence: input.confidence ?? 0.5,
  };
}
