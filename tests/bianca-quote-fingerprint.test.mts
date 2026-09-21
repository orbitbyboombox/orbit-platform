import assert from "node:assert/strict";
import test from "node:test";
import { biancaQuoteFingerprint, normalizeBiancaQuoteFingerprint } from "../features/connectors/whatsapp-cloud/bianca-quote-fingerprint.ts";

const base = {
  customerId: "CUSTOMER-1",
  activeOpportunityId: "OP-1",
  serviceCodes: ["CLASSIC", "BRANDING"],
  durationHours: 2,
  eventDate: "2026-10-10",
  eventTime: "18:00",
  location: "Casona",
  commune: "Ñuñoa",
  province: "Santiago",
  addons: ["Luces"],
  quantities: { CLASSIC: 1 },
  customerType: "COMPANY",
};

test("quote fingerprint ignores conversational noise and ordering", () => {
  const a = biancaQuoteFingerprint(base);
  const b = biancaQuoteFingerprint({ ...base, serviceCodes: ["branding", "classic"], addons: ["luces"], location: "  CASONA  " });
  assert.equal(a, b);
  assert.doesNotMatch(normalizeBiancaQuoteFingerprint(base), /hola|por favor/);
});

test("material quote change creates a new fingerprint", () => {
  assert.notEqual(biancaQuoteFingerprint(base), biancaQuoteFingerprint({ ...base, durationHours: 3 }));
});
