import assert from "node:assert/strict";
import test from "node:test";
import { classifyQuotation } from "../src/lib/quotation-auto-reply-policy.ts";

test("authorized consumer categories", () => {
  for (const [input, expected] of [["matrimonio","wedding"],["cumpleaños","birthday"],["graduación","graduation"]] as const) {
    const decision = classifyQuotation(input);
    assert.equal(decision.category, expected);
    assert.equal(decision.mode, "automatic");
  }
});
test("corporate and special leads remain manual", () => {
  for (const input of ["evento corporativo", "empresa", "evento especial", "varios días"]) {
    assert.equal(classifyQuotation(input).mode, "manual");
  }
});
test("ambiguous, missing and unclassified leads fail closed", () => {
  for (const input of ["", "consulta", "matrimonio empresarial", "cumpleaños y graduación"]) {
    assert.equal(classifyQuotation(input).mode, "manual");
  }
});
