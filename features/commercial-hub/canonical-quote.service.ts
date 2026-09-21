import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommercialActorContext } from "../connectors/whatsapp-cloud/bianca-actor-context.ts";
import type { FormalQuoteDraft } from "./types.ts";
import { prepareFormalQuotePersistence } from "./quote-persistence.ts";

export type CanonicalQuoteExecutionResult = {
  quotationId: string;
  quotationNumber: string;
  operation: "CREATED" | "UPDATED";
  total: number;
  currency: "CLP";
  actorType: CommercialActorContext["actorType"];
  actorId: CommercialActorContext["actorId"];
};

function quoteDates(validityDays: number) {
  const issueDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const expiration = new Date(`${issueDate}T12:00:00Z`);
  expiration.setUTCDate(expiration.getUTCDate() + validityDays);
  return { issueDate, expirationDate: expiration.toISOString().slice(0, 10) };
}

export async function executeCanonicalQuoteDraft(input: {
  client: SupabaseClient;
  draft: FormalQuoteDraft;
  customerId: string | null;
  actor: CommercialActorContext;
}): Promise<CanonicalQuoteExecutionResult> {
  const { draft, actor } = input;
  if (!draft.lines.length) throw new Error("QUOTE_REQUIRES_LINE_ITEM");
  if (actor.actorType === "SYSTEM_AGENT" && actor.actorId !== "BIANCA") throw new Error("BIANCA_ACTOR_INVALID");
  const quoteId = draft.quoteId ?? draft.requestId ?? crypto.randomUUID();
  const issue = quoteDates(draft.validityDays);
  const prepared = prepareFormalQuotePersistence(draft);
  const result = actor.actorType === "SYSTEM_AGENT"
    ? await input.client.rpc("save_bianca_commercial_quote_draft", {
      p_actor_id: actor.actorId,
      p_quotation_id: quoteId,
      p_quote: {
        issueDate: issue.issueDate,
        customerId: input.customerId,
        customerSnapshot: prepared.customerSnapshot,
        commercialSnapshot: prepared.commercialSnapshot,
        expirationDate: issue.expirationDate,
        subtotal: prepared.calculation.subtotal,
        discountTotal: prepared.calculation.discount,
        taxTotal: prepared.calculation.vat,
        grandTotal: prepared.calculation.total,
        validityDays: draft.validityDays,
        depositPercent: draft.depositPercent,
        globalDiscountType: draft.globalDiscountType,
        globalDiscountValue: draft.globalDiscountValue,
      },
      p_items: prepared.items,
    })
    : await input.client.rpc("save_commercial_quote_draft", {
      p_quotation_id: quoteId,
      p_quote: {
        issueDate: issue.issueDate,
        customerId: input.customerId,
        customerSnapshot: prepared.customerSnapshot,
        commercialSnapshot: prepared.commercialSnapshot,
        expirationDate: issue.expirationDate,
        subtotal: prepared.calculation.subtotal,
        discountTotal: prepared.calculation.discount,
        taxTotal: prepared.calculation.vat,
        grandTotal: prepared.calculation.total,
        validityDays: draft.validityDays,
        depositPercent: draft.depositPercent,
        globalDiscountType: draft.globalDiscountType,
        globalDiscountValue: draft.globalDiscountValue,
      },
      p_items: prepared.items,
    });
  if (result.error) throw result.error;
  const data = result.data as { quotationId?: string; quotationNumber?: string; operation?: "CREATED" | "UPDATED" } | null;
  if (!data?.quotationId || !data.quotationNumber || !data.operation) throw new Error("QUOTE_RESULT_NOT_VERIFIABLE");
  return { quotationId: data.quotationId, quotationNumber: data.quotationNumber, operation: data.operation, total: prepared.calculation.total, currency: "CLP", actorType: actor.actorType, actorId: actor.actorId };
}
