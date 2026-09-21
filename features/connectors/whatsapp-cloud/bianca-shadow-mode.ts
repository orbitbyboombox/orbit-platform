import type { BiancaIntent, BiancaActionPlan } from "./bianca-agent.types.ts";

export type BiancaShadowDecisionStatus = "SHADOW_PROPOSED" | "EXECUTED";

export type BiancaShadowDecision = {
  mode: "SHADOW";
  status: BiancaShadowDecisionStatus;
  conversationId?: string;
  customerId?: string;
  detectedIntents: readonly BiancaIntent[];
  confidence: number;
  intent: BiancaIntent;
  proposedAction: string;
  proposedResponse: string;
  missingInformation: readonly string[];
  handoffReason: string | null;
  clientMessage?: string;
  actualResponse?: string | null;
  proposedTools: readonly string[];
  blockedSideEffects: readonly ["SEND_EMAIL", "QUOTE_CREATE", "RESERVATION_START"];
  recordedAt: string;
};

export function biancaShadowModeEnabled() {
  return process.env.BIANCA_SHADOW_MODE?.trim().toLowerCase() === "true";
}

export function biancaGlobalKillSwitchEnabled() {
  return process.env.BIANCA_GLOBAL_KILL_SWITCH?.trim().toLowerCase() !== "false";
}

export function createBiancaShadowDecision(input: {
  intent: BiancaIntent;
  plan: BiancaActionPlan;
  proposedResponse: string;
  conversationId?: string;
  customerId?: string;
  detectedIntents?: readonly BiancaIntent[];
  confidence?: number;
  clientMessage?: string;
  actualResponse?: string | null;
  proposedTools?: readonly string[];
  missingInformation?: readonly string[];
  handoffReason?: string | null;
  recordedAt?: string;
}): BiancaShadowDecision {
  return {
    mode: "SHADOW",
    status: "SHADOW_PROPOSED",
    conversationId: input.conversationId,
    customerId: input.customerId,
    detectedIntents: input.detectedIntents ?? input.plan.intents,
    confidence: Math.max(0, Math.min(1, input.confidence ?? 0.5)),
    intent: input.intent,
    proposedAction: input.plan.nextBestAction,
    proposedResponse: input.proposedResponse,
    missingInformation: input.missingInformation ?? input.plan.missing,
    handoffReason: input.handoffReason ?? (input.plan.nextBestAction === "HANDOFF" ? "PLANNER_HANDOFF" : null),
    clientMessage: input.clientMessage?.slice(0, 2000),
    actualResponse: input.actualResponse?.slice(0, 2000) ?? null,
    proposedTools: input.proposedTools ?? [],
    blockedSideEffects: ["SEND_EMAIL", "QUOTE_CREATE", "RESERVATION_START"],
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
}

export function shadowConfidence(decision: { fields: Array<{ confidence: "CONFIRMED" | "APPROXIMATE" | "INFERRED" }> }) {
  if (!decision.fields.length) return 0.5;
  const weights = { CONFIRMED: 1, APPROXIMATE: 0.7, INFERRED: 0.45 } as const;
  return Number((decision.fields.reduce((sum, field) => sum + weights[field.confidence], 0) / decision.fields.length).toFixed(3));
}

export function biancaSideEffectsAllowed() {
  return !biancaGlobalKillSwitchEnabled() && !biancaShadowModeEnabled();
}
