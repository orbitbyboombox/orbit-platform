import assert from "node:assert/strict";
import test from "node:test";
import { isPhoneE164, normalizePhoneE164 } from "../lib/phone/e164.ts";

test("normalizes supported international formats without guessing country", () => {
  assert.equal(normalizePhoneE164("+56 9 1234 5678"), "+56912345678");
  assert.equal(normalizePhoneE164("+57 (300) 123-4567"), "+573001234567");
  assert.equal(normalizePhoneE164("+1 415-555-2671"), "+14155552671");
  assert.equal(normalizePhoneE164("+54 9 11 1234 5678"), "+5491112345678");
  assert.equal(normalizePhoneE164("+44 20 7946 0958"), "+442079460958");
});

test("certifies the complete international fixture matrix", () => {
  const fixtures = {
    CHILE: ["+56912345678", "+56 9 1234 5678"],
    COLOMBIA: ["+573001234567", "+57 (300) 123-4567"],
    ARGENTINA: ["+5491112345678"],
    USA: ["+14155552671", "+1 (415) 555-2671"],
    SPAIN: ["+34600111222"],
    MEXICO: ["+525512345678"],
    BRAZIL: ["+5511999999999"],
    UK: ["+447911123456"],
  } as const;
  for (const values of Object.values(fixtures)) {
    for (const value of values) assert.match(normalizePhoneE164(value) ?? "", /^\+[0-9]{8,15}$/);
  }
  assert.equal(normalizePhoneE164("+56 9 1234 5678"), normalizePhoneE164("+56912345678"));
  assert.equal(normalizePhoneE164("+57 (300) 123-4567"), normalizePhoneE164("+573001234567"));
});

test("accepts canonical E.164 and rejects implicit-country values", () => {
  assert.equal(normalizePhoneE164("+56912345678"), "+56912345678");
  assert.equal(normalizePhoneE164("56912345678"), "");
  assert.equal(normalizePhoneE164("912345678"), "");
  assert.equal(normalizePhoneE164("+123"), "");
  assert.equal(isPhoneE164("+573001234567"), true);
  assert.equal(isPhoneE164("+56 9 1234 5678"), false);
});

test("empty and malformed values remain unresolved", () => {
  assert.equal(normalizePhoneE164(""), "");
  assert.equal(normalizePhoneE164("(56) 9 foo"), "");
  assert.equal(normalizePhoneE164("++56912345678"), "");
});

test("ambiguous local values never receive an inferred country", () => {
  for (const value of ["56912345678", "912345678", "3001234567", "12345", "letters", "++56912345678", ""]) {
    assert.equal(normalizePhoneE164(value), "");
  }
});
