import type { BiancaCommercialStage } from "./bianca-agent.types.ts";

export interface BiancaStateTransition {
  from: BiancaCommercialStage;
  to: BiancaCommercialStage;
  reason: string;
  source: "PLANNER" | "ACTION" | "CUSTOMER" | "FOUNDER" | "SYSTEM";
  timestamp: string;
}

const transitions: Record<BiancaCommercialStage, BiancaCommercialStage[]> = {
  NEW_LEAD: ["QUALIFYING", "HUMAN_REQUIRED", "CLOSED_LOST"],
  QUALIFYING: ["CATALOG_SENT", "PRICING_READY", "QUOTING", "FOLLOW_UP", "HUMAN_REQUIRED", "CLOSED_LOST"],
  CATALOG_SENT: ["PRICING_READY", "QUOTING", "FOLLOW_UP", "HUMAN_REQUIRED", "CLOSED_LOST"],
  PRICING_READY: ["QUOTING", "QUOTE_SENT", "RESERVATION_INTENT", "FOLLOW_UP", "HUMAN_REQUIRED", "CLOSED_LOST"],
  QUOTING: ["QUOTE_SENT", "FOLLOW_UP", "HUMAN_REQUIRED", "CLOSED_LOST"],
  QUOTE_SENT: ["RESERVATION_INTENT", "FOLLOW_UP", "HUMAN_REQUIRED", "CLOSED_WON", "CLOSED_LOST"],
  RESERVATION_INTENT: ["RESERVATION_STARTED", "FOLLOW_UP", "HUMAN_REQUIRED", "CLOSED_LOST"],
  RESERVATION_STARTED: ["CLOSED_WON", "FOLLOW_UP", "HUMAN_REQUIRED", "CLOSED_LOST"],
  FOLLOW_UP: ["QUALIFYING", "PRICING_READY", "QUOTE_SENT", "RESERVATION_INTENT", "HUMAN_REQUIRED", "CLOSED_LOST"],
  HUMAN_REQUIRED: ["QUALIFYING", "QUOTING", "QUOTE_SENT", "RESERVATION_INTENT", "CLOSED_WON", "CLOSED_LOST"],
  CLOSED_WON: [],
  CLOSED_LOST: [],
};

export function canTransitionBiancaStage(from: BiancaCommercialStage, to: BiancaCommercialStage) {
  return from === to || transitions[from].includes(to);
}

export function transitionBiancaStage(input: Omit<BiancaStateTransition, "timestamp"> & { timestamp?: string }) {
  if (!canTransitionBiancaStage(input.from, input.to)) throw new Error(`BIANCA_INVALID_STAGE_TRANSITION:${input.from}->${input.to}`);
  return { ...input, timestamp: input.timestamp ?? new Date().toISOString() } satisfies BiancaStateTransition;
}

export function allowedBiancaTransitions(from: BiancaCommercialStage) {
  return [...transitions[from]];
}
