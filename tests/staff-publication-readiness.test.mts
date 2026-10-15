import assert from "node:assert/strict";
import test from "node:test";
import { resolveStaffPublicationReadiness } from "../features/operations/staff-publication-readiness.ts";

test("falls back to project location when operations eventAddress is blank", () => {
  const result = resolveStaffPublicationReadiness({
    eventDate: "2026-10-21",
    eventAddress: "   ",
    location: "Colegio Padre Hurtado y Juanita de Los Andes",
    city: "Las Condes",
    customerName: "Claudia Bravo",
    services: [{ serviceCode: "BBOX360", durationHours: 2 }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.location, "Colegio Padre Hurtado y Juanita de Los Andes");
});

test("reports the exact missing fields without treating assignments as required", () => {
  const result = resolveStaffPublicationReadiness({
    eventDate: "2026-10-21",
    location: "Las Condes",
    city: "Las Condes",
    customerName: "Claudia Bravo",
    services: [],
  });
  assert.deepEqual(result.missing, ["servicio y duración"]);
});
