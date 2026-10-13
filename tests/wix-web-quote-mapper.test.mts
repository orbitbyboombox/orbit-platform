import assert from "node:assert/strict";
import test from "node:test";
import { BOOMBOX_WIX_QUOTE_FORM_ID, mapBoomboxWixQuoteSubmission } from "../features/commercial-hub/wix-web-quote-mapper.ts";
import { evaluateBoomboxWebLead } from "../features/commercial-hub/web-lead-intake.ts";

const fields = { nombre_37c7: "Carolina", email_44be: "carolina@example.cl", tipo_de_evento: "Matrimonio", telefono_aa57: "+56912345678", fecha: "2027-05-02" };
test("verified Wix Forms field IDs map to ORBIT premium wedding category", () => {
  const lead = mapBoomboxWixQuoteSubmission({id:"wix-test-1", formId:BOOMBOX_WIX_QUOTE_FORM_ID, submissions:fields});
  assert.ok(lead);
  assert.equal(lead.submissionId, "wix-test-1");
  assert.equal(lead.email, "carolina@example.cl");
  assert.equal(evaluateBoomboxWebLead(lead).category, "WEDDINGS");
});
test("unknown Wix forms are not mapped into automatic quotation", () => {
  assert.equal(mapBoomboxWixQuoteSubmission({id:"x", formId:"other", submissions:fields}), null);
});
