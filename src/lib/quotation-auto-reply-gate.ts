import { classifyQuotation, type QuoteDecision } from "./quotation-auto-reply-policy";

export type QuoteSendGateInput = {
  categoryText: string;
  globalAutomationEnabled: boolean;
  scopedAutomationEnabled: boolean;
  founderQaMode: boolean;
  intakeVerified: boolean;
  templateVerified: boolean;
  recipientVerified: boolean;
  quotationId: string | null;
  previouslySent: boolean;
};

export type QuoteSendGateResult = { permitted: boolean; decision: QuoteDecision; reason: string };

/** Fail-closed decision only. Does not send mail, access secrets, or modify records. */
export function evaluateQuoteSendGate(input: QuoteSendGateInput): QuoteSendGateResult {
  const decision = classifyQuotation(input.categoryText);
  const deny = (reason: string): QuoteSendGateResult => ({ permitted: false, decision, reason });
  if (decision.mode !== "automatic") return deny("manual-category");
  if (input.founderQaMode) return deny("founder-qa-mode");
  if (!input.globalAutomationEnabled || !input.scopedAutomationEnabled) return deny("automation-disabled");
  if (!input.intakeVerified || !input.templateVerified || !input.recipientVerified) return deny("unverified-dependency");
  if (!input.quotationId?.trim()) return deny("missing-quotation-id");
  if (input.previouslySent) return deny("duplicate-send");
  return { permitted: true, decision, reason: "eligible-only-after-external-idempotency-lock" };
}
