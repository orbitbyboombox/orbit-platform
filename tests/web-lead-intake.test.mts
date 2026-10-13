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
test("automates birthdays and graduations", () => {
  for (const [eventType, category] of [["Cumpleaños", "BIRTHDAYS"], ["Graduación", "GRADUATIONS"], ["Licenciatura", "GRADUATIONS"]] as const) {
    const decision = evaluateBoomboxWebLead({ ...base, eventType });
    assert.equal(decision.category, category);
    assert.equal(decision.eligible, true);
  }
});
test("corporate and general events always require manual review", () => {
  for (const eventType of ["Evento corporativo", "Empresa", "Activación de marca", "Evento", "Congreso", "Campaña"]) {
    const decision = evaluateBoomboxWebLead({ ...base, eventType });
    assert.equal(decision.eligible, false);
    assert.equal(decision.reason, "MANUAL_COMMERCIAL_REVIEW");
  }
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

test("company graduation and corporate birthday remain manual", () => {
  for (const eventType of ["Graduación de empresa", "Cumpleaños corporativo", "Evento empresarial: matrimonio"]) {
    const decision = evaluateBoomboxWebLead({ ...base, eventType });
    assert.equal(decision.eligible, false);
    assert.equal(decision.category, "REVIEW");
  }
});
test("invalid calendar dates never qualify for automatic sending", () => {
  for (const eventDate of ["2027-02-30", "mañana", "2027-13-01"]) {
    const decision = evaluateBoomboxWebLead({ ...base, eventDate });
    assert.equal(decision.eligible, false);
    assert.equal(decision.reason, "INVALID_EVENT_DATE");
  }
});
