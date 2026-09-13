import test from "node:test";
import assert from "node:assert/strict";
import { buildCanonicalCalendarFingerprint, hashCanonicalCalendarFingerprint } from "../features/connectors/google-calendar/application/canonical-calendar-fingerprint.ts";

const base = { orbitEventId: "ORB-2026-000001", serviceStartAt: "2026-09-17T18:00:00-04:00", serviceEndAt: "2026-09-17T21:00:00-04:00", staffCallAt: "2026-09-17T17:00:00-04:00", staffCallSource: "DEFAULT_60_MINUTES", location: "  Santiago  " };

test("canonical calendar fingerprint is stable and normalizes timestamps/whitespace", () => {
  assert.equal(hashCanonicalCalendarFingerprint(base), hashCanonicalCalendarFingerprint({ ...base, location: "Santiago", serviceStartAt: new Date("2026-09-17T22:00:00Z") }));
  assert.equal(buildCanonicalCalendarFingerprint(base).includes("updatedAt"), false);
});

for (const field of ["serviceStartAt", "serviceEndAt", "staffCallAt", "staffCallSource", "location"] as const) {
  test(`canonical change in ${field} changes hash`, () => {
    const next = { ...base, [field]: field === "location" ? "Concepción" : `${String(base[field])}-changed` };
    assert.notEqual(hashCanonicalCalendarFingerprint(base), hashCanonicalCalendarFingerprint(next));
  });
}
