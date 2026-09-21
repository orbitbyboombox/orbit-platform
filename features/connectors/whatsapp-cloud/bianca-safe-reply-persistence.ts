import type { SupabaseClient } from "@supabase/supabase-js";
import type { BiancaSafeReplyEvaluation } from "./bianca-safe-reply.ts";

export async function persistBiancaSafeReply(input: {
  client: SupabaseClient;
  webhookEventId: string;
  providerMessageId: string;
  conversationId: string;
  customerId: string;
  inboundMessage: string;
  decision: { intents: readonly string[]; responseText: string; requestedAction: string };
  confidence: number;
  evaluation: BiancaSafeReplyEvaluation;
  outgoingReply: string | null;
  handoffStatus: "NONE" | "REQUIRED";
}) {
  const { error } = await input.client.from("bianca_safe_replies").upsert({
    tenant_slug: "boombox",
    webhook_event_id: input.webhookEventId,
    provider_message_id: input.providerMessageId,
    conversation_id: input.conversationId,
    customer_id: input.customerId,
    inbound_message: input.inboundMessage.slice(0, 2000),
    detected_intents: input.decision.intents,
    confidence: Math.max(0, Math.min(1, input.confidence)),
    evidence: input.evaluation.evidence,
    proposed_response: input.decision.responseText.slice(0, 2000),
    outgoing_reply: input.outgoingReply?.slice(0, 2000) ?? null,
    requested_action: input.decision.requestedAction,
    guard_decisions: input.evaluation.guardDecisions,
    status: input.evaluation.allowed ? "SENT" : input.handoffStatus === "REQUIRED" ? "HANDOFF" : "BLOCKED",
    handoff_status: input.handoffStatus,
    block_reason: input.evaluation.reason,
  }, { onConflict: "tenant_slug,provider_message_id" });
  if (error) throw error;
}
