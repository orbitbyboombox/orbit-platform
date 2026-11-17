import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendarDescription } from "../features/connectors/google-calendar/application/google-calendar-description.ts";
import type { CalendarOperationalEventInput } from "../features/connectors/google-calendar/types/google-calendar-live.types.ts";
import { chileDateTime, chileLocalToIso, resolveCanonicalStaffCallAt } from "../features/operations/event-operational-window.ts";

test("citation for a Saturday midnight service is Friday at 23:00 in Santiago", () => {
  const serviceStartAt = chileLocalToIso("2026-11-21T00:00:00");
  const call = resolveCanonicalStaffCallAt({ serviceStartAt });
  assert.deepEqual(chileDateTime(call.staffCallAt), { date: "2026-11-20", time: "23:00" });
});


const input = {
  orbitEventId: "ORB-2026-145073",
  planId: "project-1",
  planStatus: "APPROVED",
  sequence: 1,
  eventId: "project-1",
  customerName: "Catalina Sanhueza",
  customerPhone: "56921889553",
  customerEmail: "catalina@example.com",
  eventType: "CORPORATE",
  service: "CLASSIC",
  contractedHours: 3,
  eventDate: "2026-11-21",
  calendarStartDate: "2026-11-20",
  calendarStartTime: "23:00",
  operator: "Operador",
  blackBox: "",
  booth: "",
  assignedVehicle: "",
  operatorCallTime: "2026-11-20 · 23:00",
  mountingWindow: "",
  serviceStart: "00:00",
  serviceStartDate: "2026-11-21",
  serviceEnd: "03:00",
  serviceEndDate: "2026-11-21",
  dismantlingWindow: "",
  operationalNotes: "",
  extras: ["Imanes", "Transporte", "NO QR", "NO SCRAPBOOK"],
  operationalExtras: {
    categories: { QR: false, IMANES: true, SCRAPBOOK: false, FONDO: false, TRASLADO: true, OTROS: false },
    details: { IMANES: ["Imanes"], TRASLADO: ["Transporte"] },
    calendarLines: ["QR: NO", "IMANES: SÍ", "SCRAPBOOK: NO", "FONDO: NO", "TRASLADO: SÍ", "OTROS: NO"],
  },
  customerAddress: "Av. Alcalde Fernando Castillo Velasco 11095",
  operationalContact: "Catalina Sanhueza · 56921889553",
  portalUrl: "",
  orbitProjectUrl: "",
  updatedAt: "2026-11-17T00:00:00.000Z",
} as CalendarOperationalEventInput;

test("calendar description follows the approved order and omits disabled extras", () => {
  const description = buildCalendarDescription(input, "ORB-2026-145073");
  const lines = description.split("\n");
  assert.equal(lines[0], "CITACIÓN OPERADORES BOOMBOX: viernes 20/11/2026 a las 23:00 (1 hora antes del servicio).");
  assert.equal(lines[1], "SERVICIO CLIENTE: sábado 21/11/2026 de 00:00 a 03:00 (3 horas).");
  assert.equal(lines[2], "Servicio: CLASSIC");
  assert.equal(lines[3], "Duración contratada: 3 horas");
  assert.equal(lines[4], "Extras incluidos: Imanes, Transporte");
  assert.equal(lines.at(-1), "ORBIT Event ID: ORB-2026-145073");
  assert.doesNotMatch(description, /NO QR|NO SCRAPBOOK|QR: NO|SCRAPBOOK: NO/);
});

test("calendar description formats a service that crosses midnight", () => {
  const description = buildCalendarDescription({
    ...input,
    serviceStartDate: "2026-11-20",
    serviceStart: "23:00",
    serviceEndDate: "2026-11-21",
    serviceEnd: "02:00",
    contractedHours: 3,
  }, "ORB-2026-145074");
  assert.match(description, /SERVICIO CLIENTE: viernes 20\/11\/2026 a las 23:00 hasta sábado 21\/11\/2026 a las 02:00 \(3 horas\)\./);
});
