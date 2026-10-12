import assert from "node:assert/strict";
import test from "node:test";
import { evaluateQuoteSendGate, type QuoteSendGateInput } from "../src/lib/quotation-auto-reply-gate.ts";
const valid: QuoteSendGateInput = {
  categoryText: "matrimonio", globalAutomationEnabled: true, scopedAutomationEnabled: true,
  founderQaMode: false, intakeVerified: true, templateVerified: true, recipientVerified: true,
  quotationId: "Q-123", previouslySent: false,
};
test("eligible quote requires all safety conditions", () => {
  assert.equal(evaluateQuoteSendGate(valid).permitted, true);
});
test("manual, disabled, QA, missing evidence and duplicate cases fail closed", () => {
  const overrides: Partial<QuoteSendGateInput>[] = [
    {categoryText:"empresa"}, {categoryText:"cumpleaños corporativo"},
    {globalAutomationEnabled:false}, {scopedAutomationEnabled:false},
    {founderQaMode:true}, {intakeVerified:false}, {templateVerified:false},
    {recipientVerified:false}, {quotationId:""}, {previouslySent:true},
  ];
  for (const override of overrides) assert.equal(evaluateQuoteSendGate({...valid,...override}).permitted,false,JSON.stringify(override));
});
