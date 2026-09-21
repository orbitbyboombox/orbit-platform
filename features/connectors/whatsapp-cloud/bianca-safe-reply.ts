import { biancaGlobalKillSwitchEnabled, biancaShadowModeEnabled } from "./bianca-shadow-mode.ts";
import type { BiancaActionEvidence } from "./bianca-claim-guards.ts";
import type { WhatsAppAiDecision } from "./whatsapp-ai.responder.ts";

export type BiancaSafeReplyConfidence = "LOW" | "MEDIUM" | "HIGH";
export type BiancaSafeReplyEvidenceKind =
  | "GENERAL_KNOWLEDGE"
  | "CANONICAL_CATALOG"
  | "CANONICAL_PRICE"
  | "CANONICAL_PAYMENT"
  | "CANONICAL_AVAILABILITY"
  | "CANONICAL_LOCATION"
  | "NONE";

export type BiancaSafeReplyEvidence = {
  verified: boolean;
  kind: BiancaSafeReplyEvidenceKind;
  sourceRef?: string | null;
};

export type BiancaSafeReplyGuardDecisions = {
  stage: "SAFE_REPLY" | "SHADOW" | "OTHER";
  allowlisted: boolean;
  confidenceBand: BiancaSafeReplyConfidence;
  confidenceAllowed: boolean;
  evidenceAllowed: boolean;
  claimAllowed: boolean;
  killSwitchBlocked: boolean;
  executionFlagsBlocked: boolean;
};

export type BiancaSafeReplyEvaluation = {
  allowed: boolean;
  handoffRequired: boolean;
  reason: string | null;
  confidenceBand: BiancaSafeReplyConfidence;
  evidence: BiancaSafeReplyEvidence;
  guardDecisions: BiancaSafeReplyGuardDecisions;
};

const BLOCKED_INTENTS = new Set<WhatsAppAiDecision["intents"][number]>([
  "OBJECION_PRECIO",
  "QUIERE_COTIZAR",
  "COTIZACION_ESPECIAL",
  "SEGUIMIENTO_COTIZACION",
  "MODIFICAR_COTIZACION",
  "CLIENTE_QUIERE_RESERVAR",
]);

function stage() {
  return process.env.BIANCA_STAGE?.trim().toUpperCase() || "SHADOW";
}

function realResponseFlagEnabled() {
  const value = process.env.WHATSAPP_REAL_RESPONSE?.trim().toLowerCase();
  return value === "on" || value === "true";
}

function confidenceBand(confidence: number): BiancaSafeReplyConfidence {
  if (confidence >= 0.85) return "HIGH";
  if (confidence >= 0.65) return "MEDIUM";
  return "LOW";
}

function evidenceMatchesDecision(decision: WhatsAppAiDecision, evidence: BiancaSafeReplyEvidence) {
  if (!evidence.verified) return false;
  if (decision.requestedAction === "CATALOG_LOOKUP") return evidence.kind === "CANONICAL_CATALOG";
  if (decision.requestedAction === "COMMERCIAL_LOOKUP") {
    return ["CANONICAL_PRICE", "CANONICAL_PAYMENT", "CANONICAL_AVAILABILITY", "CANONICAL_LOCATION"].includes(evidence.kind);
  }
  return evidence.kind === "GENERAL_KNOWLEDGE" || evidence.kind === "NONE";
}

export function biancaSafeReplyConfiguration() {
  return {
    stage: stage(),
    realResponseEnabled: realResponseFlagEnabled(),
    shadowMode: biancaShadowModeEnabled(),
    killSwitchEnabled: biancaGlobalKillSwitchEnabled(),
    sideEffectToolsEnabled: false as const,
  };
}

export function evaluateBiancaSafeReply(input: {
  decision: WhatsAppAiDecision;
  response: string;
  confidence: number;
  evidence: BiancaSafeReplyEvidence;
  claimViolations?: readonly string[];
  actionEvidence?: BiancaActionEvidence;
}): BiancaSafeReplyEvaluation {
  const config = biancaSafeReplyConfiguration();
  const band = confidenceBand(input.confidence);
  const disallowedIntent = input.decision.intents.some((intent) => BLOCKED_INTENTS.has(intent));
  const handoffAction = input.decision.requestedAction === "HUMAN_HANDOFF" || input.decision.requestedAction === "MANUAL_REVIEW";
  const allowlisted = !disallowedIntent && !handoffAction && ["NONE", "WAIT_FOR_CUSTOMER", "CATALOG_LOOKUP", "COMMERCIAL_LOOKUP"].includes(input.decision.requestedAction);
  const evidenceAllowed = evidenceMatchesDecision(input.decision, input.evidence);
  const claimAllowed = (input.claimViolations?.length ?? 0) === 0;
  const confidenceAllowed = band === "HIGH" || (band === "MEDIUM" && allowlisted && evidenceAllowed);
  const killSwitchBlocked = config.killSwitchEnabled;
  const executionFlagsBlocked = !config.sideEffectToolsEnabled;
  const configured = config.stage === "SAFE_REPLY" && config.realResponseEnabled && !config.shadowMode;
  const allowed = configured && !killSwitchBlocked && allowlisted && evidenceAllowed && claimAllowed && confidenceAllowed;
  let reason: string | null = null;
  if (!configured) reason = "SAFE_REPLY_NOT_ENABLED";
  else if (killSwitchBlocked) reason = "GLOBAL_KILL_SWITCH_ACTIVE";
  else if (handoffAction || disallowedIntent) reason = "HUMAN_HANDOFF_REQUIRED";
  else if (!evidenceAllowed) reason = "CANONICAL_EVIDENCE_REQUIRED";
  else if (!claimAllowed) reason = "UNSUPPORTED_CLAIM_BLOCKED";
  else if (band === "LOW") reason = "LOW_CONFIDENCE";
  else if (!confidenceAllowed) reason = "MEDIUM_CONFIDENCE_NOT_SAFE";
  return {
    allowed,
    handoffRequired: !allowed,
    reason,
    confidenceBand: band,
    evidence: input.evidence,
    guardDecisions: {
      stage: config.stage === "SAFE_REPLY" ? "SAFE_REPLY" : config.stage === "SHADOW" ? "SHADOW" : "OTHER",
      allowlisted,
      confidenceBand: band,
      confidenceAllowed,
      evidenceAllowed,
      claimAllowed,
      killSwitchBlocked,
      executionFlagsBlocked,
    },
  };
}

export function safeReplyEvidenceFromDecision(decision: WhatsAppAiDecision): BiancaSafeReplyEvidence {
  // The AI decision is not evidence by itself. A canonical adapter must pass
  // verified evidence explicitly before catalog, price, availability, payment
  // or location claims can be released.
  return { verified: false, kind: "NONE" };
}
