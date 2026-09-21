import type { SupabaseClient } from "@supabase/supabase-js";
import type { WhatsAppAiDecision } from "./whatsapp-ai.responder";
import { deliverCanonicalCatalogFromWhatsApp, type WhatsAppCatalogDeliveryResult } from "./whatsapp-catalog.delivery";
import { planBiancaTurn } from "./bianca-commercial-planner";
import { unsupportedBiancaClaims, type BiancaActionEvidence } from "./bianca-claim-guards";
import { BIANCA_TOOL_REGISTRY } from "./bianca-tool-registry";
import { assertBiancaActionAuthorized, biancaSystemActor, type CommercialActorContext } from "./bianca-actor-context";
import { executeCanonicalQuoteDraft, type CanonicalQuoteExecutionResult } from "../../commercial-hub/canonical-quote.service";
import { actionRunIdempotencyKey } from "./bianca-action-runs";
import { BiancaActionRunRepository } from "./bianca-action-runs.repository";
import type { FormalQuoteDraft } from "../../commercial-hub/types";

export type BiancaQuoteExecutionEvidence = CanonicalQuoteExecutionResult & {
  actionRunId: string;
  opportunityId: string;
  status: "SUCCESS" | "ALREADY_DONE";
};

/**
 * Central boundary for BIANCA's action-first turn. Language remains an LLM
 * concern; action selection, execution and claim verification stay here.
 */
export class BiancaAgentOrchestrator {
  constructor(private readonly client: SupabaseClient) {}

  plan(input: Parameters<typeof planBiancaTurn>[0]) {
    return planBiancaTurn(input);
  }

  actorContext(input?: Pick<CommercialActorContext, "conversationId" | "opportunityId" | "actionRunId">): CommercialActorContext {
    return { ...biancaSystemActor(), ...input };
  }

  authorize(action: "QUOTE_CREATE" | "SEND_EMAIL" | "RESERVATION_START", context: CommercialActorContext) {
    assertBiancaActionAuthorized(action, context);
    return context;
  }

  async sendCatalog(input: Parameters<typeof deliverCanonicalCatalogFromWhatsApp>[0]): Promise<WhatsAppCatalogDeliveryResult> {
    const contract = BIANCA_TOOL_REGISTRY.SEND_CATALOG;
    if (!contract.idempotent) throw new Error("BIANCA_TOOL_CONTRACT_INVALID:SEND_CATALOG");
    return deliverCanonicalCatalogFromWhatsApp(input);
  }

  async createQuote(input: {
    draft: FormalQuoteDraft;
    customerId: string;
    conversationId: string;
    opportunityId: string;
    normalizedInputHash: string;
  }): Promise<BiancaQuoteExecutionEvidence> {
    const actor = this.actorContext({ conversationId: input.conversationId, opportunityId: input.opportunityId });
    this.authorize("QUOTE_CREATE", actor);
    const runs = new BiancaActionRunRepository(this.client);
    const idempotencyKey = actionRunIdempotencyKey({
      customerId: input.customerId,
      conversationId: input.conversationId,
      opportunityId: input.opportunityId,
      actionType: "QUOTE_CREATE",
      inputSummary: { normalizedInputHash: input.normalizedInputHash },
      normalizedInputHash: input.normalizedInputHash,
    });
    const claim = await runs.claim({
      customerId: input.customerId,
      conversationId: input.conversationId,
      opportunityId: input.opportunityId,
      actionType: "QUOTE_CREATE",
      idempotencyKey,
      inputSummary: { normalizedInputHash: input.normalizedInputHash, quoteId: input.draft.quoteId ?? input.draft.requestId ?? null },
      actorType: "SYSTEM_AGENT",
      actorId: "BIANCA",
      source: "WHATSAPP_AGENT",
    });
    if (claim.status === "ALREADY_DONE") {
      const existing = await runs.findById(claim.runId);
      const result = existing?.result_summary as Partial<BiancaQuoteExecutionEvidence> | null;
      if (result?.quotationId && result.quotationNumber) return { ...result as BiancaQuoteExecutionEvidence, actionRunId: claim.runId, status: "ALREADY_DONE" };
      throw new Error("BIANCA_QUOTE_EVIDENCE_MISSING");
    }
    if (claim.status !== "CLAIMED") throw new Error("BIANCA_QUOTE_ACTION_RUNNING");
    try {
      const execution = await executeCanonicalQuoteDraft({ client: this.client, draft: input.draft, customerId: input.customerId, actor });
      const evidence: BiancaQuoteExecutionEvidence = { ...execution, actionRunId: claim.runId, opportunityId: input.opportunityId, status: "SUCCESS" };
      await runs.finish(claim.runId, { status: "SUCCESS", resultSummary: evidence, externalRef: execution.quotationId });
      return evidence;
    } catch (error) {
      await runs.finish(claim.runId, { status: "FAILED", errorCode: "RETRYABLE" });
      throw error;
    }
  }

  verifyResponse(response: string, evidence: BiancaActionEvidence) {
    return unsupportedBiancaClaims(response, evidence);
  }
}
