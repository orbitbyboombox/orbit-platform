import type { SupabaseClient } from "@supabase/supabase-js";
import type { BiancaShadowDecision } from "./bianca-shadow-mode.ts";

export type BiancaShadowMetrics = {
  totalDecisions: number;
  intentAccuracy: number | null;
  missingDataAccuracy: number | null;
  handoffRate: number;
  hallucinationClaimBlocks: number;
  proposedQuoteCorrect: number | null;
  duplicatePrevention: number;
  averageConfidence: number;
};

export async function persistBiancaShadowDecision(input: {
  client: SupabaseClient;
  providerMessageId: string;
  webhookEventId?: string;
  decision: BiancaShadowDecision;
}) {
  const { error } = await input.client.from("bianca_shadow_decisions").upsert({
    tenant_slug: "boombox",
    webhook_event_id: input.webhookEventId ?? null,
    provider_message_id: input.providerMessageId,
    conversation_id: input.decision.conversationId ?? null,
    customer_id: input.decision.customerId ?? null,
    client_message: input.decision.clientMessage ?? "",
    actual_response: input.decision.actualResponse ?? null,
    detected_intents: input.decision.detectedIntents,
    confidence: input.decision.confidence,
    proposed_response: input.decision.proposedResponse,
    proposed_tools: input.decision.proposedTools,
    proposed_action: input.decision.proposedAction,
    missing_information: input.decision.missingInformation,
    handoff_reason: input.decision.handoffReason,
    blocked_side_effects: input.decision.blockedSideEffects,
    status: input.decision.status,
  }, { onConflict: "tenant_slug,provider_message_id" });
  if (error) throw error;
}

export async function loadBiancaShadowMetrics(client: SupabaseClient): Promise<BiancaShadowMetrics> {
  const { data, error } = await client.from("bianca_shadow_decisions").select("confidence,handoff_reason,claim_block_count,duplicate_prevented,review_status,review_labels");
  if (error) throw error;
  const rows = data ?? [];
  const reviewed = rows.filter((row) => row.review_status === "REVIEWED");
  const reviewedBooleanRate = (key: string) => {
    const values = reviewed.map((row) => (row.review_labels as Record<string, unknown> | null)?.[key]).filter((value): value is boolean => typeof value === "boolean");
    return values.length ? values.filter(Boolean).length / values.length : null;
  };
  return {
    totalDecisions: rows.length,
    intentAccuracy: reviewedBooleanRate("intentCorrect"),
    missingDataAccuracy: reviewedBooleanRate("missingDataCorrect"),
    handoffRate: rows.length ? rows.filter((row) => Boolean(row.handoff_reason)).length / rows.length : 0,
    hallucinationClaimBlocks: rows.reduce((sum, row) => sum + Number(row.claim_block_count ?? 0), 0),
    proposedQuoteCorrect: reviewedBooleanRate("proposedQuoteCorrect"),
    duplicatePrevention: rows.length ? rows.filter((row) => row.duplicate_prevented === true).length / rows.length : 0,
    averageConfidence: rows.length ? rows.reduce((sum, row) => sum + Number(row.confidence ?? 0), 0) / rows.length : 0,
  };
}

export async function reviewBiancaShadowDecision(input: {
  client: SupabaseClient;
  id: string;
  reviewerId: string;
  labels: Record<string, boolean | string>;
}) {
  const { error } = await input.client.from("bianca_shadow_decisions").update({
    review_status: "REVIEWED",
    review_labels: input.labels,
    reviewed_by: input.reviewerId,
    reviewed_at: new Date().toISOString(),
  }).eq("id", input.id).eq("status", "SHADOW_PROPOSED");
  if (error) throw error;
}
