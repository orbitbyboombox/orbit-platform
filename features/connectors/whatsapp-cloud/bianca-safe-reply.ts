import { biancaGlobalKillSwitchEnabled, biancaShadowModeEnabled } from "./bianca-shadow-mode.ts";
import type { BiancaActionEvidence } from "./bianca-claim-guards.ts";
import type { WhatsAppAiDecision } from "./whatsapp-ai.responder.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogPublicUrl, type CommercialCatalogCategory } from "../../commercial-hub/catalogs.ts";

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
  availability?: "AVAILABLE" | "UNAVAILABLE";
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

export function biancaAutomationRouting(input: {
  shadowMode: boolean;
  safeReplyMode: boolean;
  globalAutomationEnabled: boolean;
  qaAuthorized: boolean;
}) {
  return {
    initialAutomationEnabled: input.shadowMode || input.safeReplyMode || input.globalAutomationEnabled,
    automationEnabled: input.qaAuthorized || input.safeReplyMode || input.globalAutomationEnabled,
  };
}

function normalizedTurnText(text: string) {
  return text.toLocaleLowerCase("es-CL").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isAmbiguousTurn(text: string) {
  return /^(?:eso|ese|esa|ahi|all[ií]|lo mismo|dale|si|ya)$/i.test(text.trim());
}

export function safeReplyConfidence(input: {
  decision: WhatsAppAiDecision;
  messageText: string;
  evidence: BiancaSafeReplyEvidence;
}) {
  const text = normalizedTurnText(input.messageText);
  if (isAmbiguousTurn(text)) return 0.5;

  const clearCatalog = input.decision.requestedAction === "CATALOG_LOOKUP"
    && /\b(?:servicios?|opciones?|catalogo|planes?|folleto|muestra)\b/.test(text);
  const clearPayment = input.decision.requestedAction === "COMMERCIAL_LOOKUP"
    && (input.decision.intents.includes("PAGO") || /\b(?:pago|pagar|abono|saldo|transferencia|tarjeta|webpay)\b/.test(text));
  const clearCommercialLookup = input.decision.requestedAction === "COMMERCIAL_LOOKUP"
    && (input.decision.intents.includes("CONSULTA_PRECIO") || input.decision.intents.includes("DISPONIBILIDAD"));
  const clearGeneral = ["NONE", "WAIT_FOR_CUSTOMER"].includes(input.decision.requestedAction)
    && input.decision.intents.includes("CONSULTA_GENERAL")
    && text.length >= 8;
  const evidenceMatches = evidenceMatchesDecision(input.decision, input.evidence);
  if ((clearCatalog && input.evidence.kind === "CANONICAL_CATALOG") || (clearPayment && input.evidence.kind === "CANONICAL_PAYMENT") || (clearCommercialLookup && evidenceMatches) || (clearGeneral && input.evidence.kind === "GENERAL_KNOWLEDGE")) {
    return 0.95;
  }
  if (input.decision.requestedAction === "HUMAN_HANDOFF" || input.decision.requestedAction === "MANUAL_REVIEW") return 0.9;
  if (evidenceMatches && text.length >= 8) return 0.8;
  return 0.5;
}

export function isActiveHumanTakeover(conversationState: { context?: Record<string, unknown> | null }) {
  const takeover = conversationState.context?.humanTakeover;
  return Boolean(takeover && typeof takeover === "object" && (takeover as Record<string, unknown>).active === true);
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
    // A guard block is deliberately not a human takeover. It is recorded as
    // BLOCKED and the conversation may be evaluated again on the next inbound.
    // Only an explicit human policy/action creates persistent handoff state.
    handoffRequired: handoffAction || disallowedIntent,
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

function confirmedField(decision: WhatsAppAiDecision, field: WhatsAppAiDecision["fields"][number]["field"]) {
  const value = [...decision.fields].reverse().find((item) => item.field === field && item.confidence === "CONFIRMED")?.value;
  return typeof value === "string" ? value.trim() : undefined;
}

function confirmedNumber(decision: WhatsAppAiDecision, field: WhatsAppAiDecision["fields"][number]["field"]) {
  const value = [...decision.fields].reverse().find((item) => item.field === field && item.confidence === "CONFIRMED")?.value;
  return typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : undefined;
}

function noEvidence(): BiancaSafeReplyEvidence {
  return { verified: false, kind: "NONE", sourceRef: null };
}

export async function resolveCanonicalBiancaSafeReplyEvidence(input: {
  client: SupabaseClient;
  decision: WhatsAppAiDecision;
  messageText: string;
  known?: {
    eventDate?: string;
    startTime?: string;
    durationHours?: number;
    serviceCodes?: readonly string[];
    commune?: string;
    venue?: string;
  };
}): Promise<BiancaSafeReplyEvidence> {
  try {
    if (input.decision.requestedAction === "CATALOG_LOOKUP") {
      if (input.decision.catalogCategory === "NONE") return noEvidence();
      const category = input.decision.catalogCategory as CommercialCatalogCategory;
      const { data, error } = await input.client.from("commercial_documents").select("id,version,status,category").eq("category", category).eq("status", "ACTIVE").single();
      if (error || !data || data.category !== category) return noEvidence();
      return { verified: true, kind: "CANONICAL_CATALOG", sourceRef: catalogPublicUrl(category, process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit.boom-box.cl") };
    }

    if (input.decision.requestedAction === "COMMERCIAL_LOOKUP") {
      const text = input.messageText.toLocaleLowerCase("es-CL");
      if (input.decision.intents.includes("PAGO") || /\b(?:pago|pagar|abono|saldo|transferencia|tarjeta|webpay)\b/i.test(text)) {
        const { PAYMENT_METHOD_RULES } = await import("../../business-core/rules/payment.rules.ts");
        const primary = PAYMENT_METHOD_RULES.BANK_TRANSFER;
        return { verified: true, kind: "CANONICAL_PAYMENT", sourceRef: `business-core:payment.rules:${primary.id}:${primary.availability}` };
      }
      if (input.decision.intents.includes("DISPONIBILIDAD") || /\bdisponib(?:le|ilidad)\b|\bfecha\b/i.test(text)) {
        const { lookupBiancaAvailability } = await import("./bianca-runtime-tools.ts");
        const result = await lookupBiancaAvailability(input.client, {
          eventDate: input.known?.eventDate ?? confirmedField(input.decision, "eventDate"),
          startTime: input.known?.startTime ?? confirmedField(input.decision, "startTime"),
          durationHours: input.known?.durationHours ?? confirmedNumber(input.decision, "durationHours"),
          serviceCodes: input.known?.serviceCodes,
          commune: input.known?.commune ?? confirmedField(input.decision, "commune"),
          venue: input.known?.venue ?? confirmedField(input.decision, "venue"),
        });
        if (result.status === "AVAILABLE" || result.status === "UNAVAILABLE") return { verified: true, kind: "CANONICAL_AVAILABILITY", availability: result.status, sourceRef: "bianca-runtime-tools:lookupBiancaAvailability" };
        return noEvidence();
      }
      if (input.decision.intents.includes("CONSULTA_PRECIO") || /\b(?:precio|valor|cu[aá]nto|cuesta|sale)\b/i.test(text)) {
        const { lookupBiancaPrice } = await import("./bianca-runtime-tools.ts");
        const result = await lookupBiancaPrice(input.client, {
          text: input.messageText,
          serviceCodes: input.known?.serviceCodes,
          durationHours: input.known?.durationHours ?? confirmedNumber(input.decision, "durationHours"),
          commune: input.known?.commune ?? confirmedField(input.decision, "commune"),
          specialVenue: input.known?.venue ?? confirmedField(input.decision, "venue"),
        });
        if (result.status === "RESOLVED") return { verified: true, kind: "CANONICAL_PRICE", sourceRef: "bianca-runtime-tools:lookupBiancaPrice" };
        return noEvidence();
      }
      if (/\b(?:comuna|regi[oó]n|traslado|transporte|peaje|vi[nñ]a|valpara[ií]so|concepci[oó]n)\b/i.test(text)) {
        const { data, error } = await input.client.from("master_data_entries").select("code,configuration").eq("domain", "MUNICIPALITIES").eq("enabled", true);
        if (error || !data?.length) return noEvidence();
        const needle = (input.known?.commune ?? text).toLocaleLowerCase("es-CL");
        const matched = data.some((row) => JSON.stringify(row).toLocaleLowerCase("es-CL").includes(needle));
        return matched ? { verified: true, kind: "CANONICAL_LOCATION", sourceRef: "master_data_entries:MUNICIPALITIES" } : noEvidence();
      }
      return noEvidence();
    }

    if (input.decision.requestedAction === "NONE" || input.decision.requestedAction === "WAIT_FOR_CUSTOMER") {
      return { verified: true, kind: "GENERAL_KNOWLEDGE", sourceRef: "bianca-commercial-knowledge:authorized" };
    }
    return noEvidence();
  } catch {
    return noEvidence();
  }
}
