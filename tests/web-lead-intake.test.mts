import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBoomboxWebLead } from "../features/commercial-hub/web-lead-intake.ts";

const base = { sourceUrl: "https://www.boom-box.cl/cotizar", name: "Carolina", email: "Carolina@Example.cl", eventType: "Matrimonio", eventDate: "2027-04-04", submissionId: "request-123" };
test("classifies weddings using existing premium category", () => {
  const result = evaluateBoomboxWebLead(base);
  assert.equal(result.eligible, true);
  assert.equal(result.category, "WEDDINGS");
  assert.equal(result.normalizedEmail, "carolina@example.cl");
});
test("both BOOMBOX domains share the same duplicate key", () => {
  const one = evaluateBoomboxWebLead(base);
  const two = evaluateBoomboxWebLead({ ...base, sourceUrl: "https://bbox.cl/contacto" });
  assert.equal(one.dedupeKey, two.dedupeKey);
  assert.equal(two.sourceDomain, "bbox.cl");
});
test("routes birthdays and companies to existing templates", () => {
  assert.equal(evaluateBoomboxWebLead({ ...base, eventType: "Cumpleaños" }).category, "BIRTHDAYS");
  assert.equal(evaluateBoomboxWebLead({ ...base, eventType: "Evento corporativo" }).category, "COMPANIES_CATALOG");
});
test("unrecognized event stays in review, never auto-send", () => {
  const decision = evaluateBoomboxWebLead({ ...base, eventType: "Otro" });
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "UNSUPPORTED_EVENT_TYPE");
});
test("missing critical data stays in review", () => {
  assert.equal(evaluateBoomboxWebLead({ ...base, email: "" }).reason, "MISSING_EMAIL");
  assert.equal(evaluateBoomboxWebLead({ ...base, eventDate: "" }).reason, "MISSING_EVENT_DATE");
});
test("spoofed hosts and insecure http do not qualify", () => {
  assert.equal(evaluateBoomboxWebLead({ ...base, sourceUrl: "https://boom-box.cl.evil.com" }).eligible, false);
  assert.equal(evaluateBoomboxWebLead({ ...base, sourceUrl: "http://bbox.cl" }).eligible, false);
});
