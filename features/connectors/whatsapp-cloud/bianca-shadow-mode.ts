import type { BiancaIntent } from "./bianca-agent.types.ts";
import type { BiancaActionPlan } from "./bianca-agent.types.ts";

export type BiancaShadowDecision = {
  mode: "SHADOW";
  intent: BiancaIntent;
  proposedAction: string;
  proposedResponse: string;
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
  recordedAt?: string;
}): BiancaShadowDecision {
  return {
    mode: "SHADOW",
    intent: input.intent,
    proposedAction: input.plan.nextBestAction,
    proposedResponse: input.proposedResponse,
    blockedSideEffects: ["SEND_EMAIL", "QUOTE_CREATE", "RESERVATION_START"],
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
}

export function biancaSideEffectsAllowed() {
  return !biancaGlobalKillSwitchEnabled() && !biancaShadowModeEnabled();
}
