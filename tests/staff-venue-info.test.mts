import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolveStaffVenueInfo } from "../features/portal-authentication/staff-venue-info.ts";

test("Portal Staff reuses Admin venue and operational access fields", () => {
  assert.deepEqual(resolveStaffVenueInfo({
    operations: { venue: "Centro de Eventos", venueReference: "Entrada norte" },
    location: "Dirección comercial",
    contract: {
      access_instructions: "Ingresar por carga",
      parking_status: "AVAILABLE",
      operational_notes: "Avisar al encargado",
      logistics_notes: "Descarga por estacionamiento norte",
    },
  }), {
    name: "Centro de Eventos",
    reference: "Entrada norte",
    accessInstructions: "Ingresar por carga",
    parking: "AVAILABLE",
    observations: "Avisar al encargado · Descarga por estacionamiento norte",
  });
});

test("missing venue details remain safe and do not invent values", () => {
  assert.deepEqual(resolveStaffVenueInfo({ operations: {}, location: null, contract: null }), {
    name: "Recinto pendiente de confirmar",
    reference: "",
    accessInstructions: "",
    parking: "",
    observations: "",
  });
});

test("Staff detail reads only events assigned to the authenticated staff member", () => {
  const source = readFileSync("features/portal-authentication/staff-portal.tsx", "utf8");
  assert.match(source, /from\("assignments"\)\.select\([\s\S]*?\.eq\("staff_id",staffId\)/);
  assert.match(source, /project_operational_contracts/);
  assert.match(source, /resolveStaffVenueInfo/);
});
