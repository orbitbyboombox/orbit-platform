import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { progressiveAvailabilityMessage, progressiveAvailabilityState } from "../features/capacity/progressive-availability.ts";
const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("progressive availability never reports final availability from incomplete inputs", () => {
  assert.equal(progressiveAvailabilityState({}), "MISSING_DATE");
  assert.equal(progressiveAvailabilityState({ date: "2026-10-01" }), "MISSING_TIME");
  assert.equal(progressiveAvailabilityState({ date: "2026-10-01", time: "18:00" }), "PRELIMINARY");
  assert.equal(progressiveAvailabilityMessage("MISSING_TIME"), "Selecciona el horario para validar disponibilidad.");
  assert.equal(progressiveAvailabilityState({ date: "2026-10-01", time: "18:00", location: "Santiago" }), "MISSING_SERVICE");
  assert.equal(progressiveAvailabilityState({ date: "2026-10-01", time: "18:00", location: "Santiago", service: true, loading: true }), "VALIDATING");
  assert.equal(progressiveAvailabilityState({ date: "2026-10-01", time: "18:00", location: "Santiago", service: true, result: "AVAILABLE" }), "AVAILABLE");
});

test("shared capacity panel presents canonical states and fails closed", async () => {
  const source = await read("features/capacity/capacity-status-panel.tsx");
  const resolver = await read("features/capacity/progressive-availability.ts");
  for (const value of ["AVAILABLE", "UNAVAILABLE", "REVIEW_REQUIRED", "VALIDANDO DISPONIBILIDAD", "SIN DISPONIBILIDAD", "REQUIERE REVISIÓN"]) assert.match(`${source}\n${resolver}`, new RegExp(value));
  assert.match(source, /humanSafeReason/);
  assert.match(source, /Completa fecha, horario y ubicación/);
  assert.doesNotMatch(source, /customer|other reservation/i);
});

test("Event Workspace consumes get_event_capacity without changing the engine", async () => {
  const page = await read("app/(platform)/projects/[projectId]/page.tsx");
  const workspace = await read("features/projects/components/project-workspace-experience.tsx");
  assert.match(page, /rpc\("get_event_capacity"/);
  assert.match(workspace, /CapacityStatusPanel/);
  assert.match(workspace, /capacityResult/);
});

test("capacity presentation keeps BBOX360 independent from CASE", async () => {
  const source = await read("features/capacity/capacity-status-panel.tsx");
  assert.match(source, /bboxCapacity/);
  assert.match(source, /BBOX360/);
});

test("draft preflight is read-only and race-safe at the quote surface", async () => {
  const migration = await read("supabase/migrations/0238_draft_capacity_preflight.sql");
  const quote = await read("features/projects/components/quotation-experience.tsx");
  assert.match(migration, /preflight_draft_capacity/);
  assert.doesNotMatch(migration, /insert into|update public\.(projects|crm_reservations|operational_assets)|create table/i);
  assert.match(quote, /capacityRequest/);
  assert.match(quote, /draftCapacityPreflightAction/);
  assert.match(quote, /setCapacity\(null\)/);
});

test("real manual reservation drawer always exposes the shared capacity preflight", async () => {
  const drawer = await read("features/projects/components/new-project-drawer.tsx");
  assert.match(drawer, /draftCapacityPreflightAction/);
  assert.match(drawer, /<CapacityStatusPanel result=\{capacityResult\}/);
  assert.match(drawer, /missingInputs=\{capacityMissingInputs\}/);
  assert.match(drawer, /capacityDisplayState = capacityMissingInputs \? "PENDING_INPUT"/);
  assert.match(drawer, /progressiveState=\{capacityDisplayState\}/);
  assert.match(drawer, /data-capacity-section/);
  assert.ok(drawer.indexOf("data-capacity-section") < drawer.indexOf("data-reservation-wizard-scroll"));
  for (const field of ["draft.event.date", "draft.event.time", "draft.event.durationHours", "eventAddress", "draft.event.city", "draft.services"]) assert.match(drawer, new RegExp(field.replaceAll(".", "\\.")));
  assert.match(drawer, /requestId !== capacityRequest.current/);
});

test("manual wizard uses a neutral pending state before event inputs", async () => {
  const resolver = await read("features/capacity/progressive-availability.ts");
  const panel = await read("features/capacity/capacity-status-panel.tsx");
  assert.match(resolver, /PENDING_INPUT/);
  assert.equal(progressiveAvailabilityMessage("PENDING_INPUT"), "Completa los datos del evento para revisar disponibilidad.");
  assert.match(panel, /Disponibilidad pendiente/);
});

test("real Constructor de cotizaciones renders availability in the same screen", async () => {
  const hub = await read("features/commercial-hub/commercial-hub.tsx");
  assert.match(hub, /Constructor de cotizaciones/);
  assert.match(hub, /<CapacityStatusPanel result=\{capacityResult\}/);
  assert.match(hub, /missingMessage=\{progressiveAvailabilityMessage\(capacityState\)\}/);
  assert.match(hub, /data-capacity-section/);
  assert.ok(hub.indexOf("Fecha del evento") < hub.indexOf("data-capacity-section"));
  assert.ok(hub.indexOf("data-capacity-section") < hub.indexOf("Agregar desde catálogo"));
});

test("event occupancy includes confirmed current project without changing self-preflight", async () => {
  const page = await read("app/(platform)/projects/[projectId]/page.tsx");
  const engine = await read("supabase/migrations/0236_canonical_capacity_engine.sql");
  assert.match(engine, /res\.project_id<>p_project_id/);
  assert.match(page, /reservation\?\.status === "CONFIRMED"/);
  assert.match(page, /required\.CASE/);
  assert.match(page, /required\.BBOX360 \? addCurrent/);
  assert.match(page, /capacityResult=\{capacityProjection\}/);
});

test("customer closing exposes safe availability language and gates confirmation", async () => {
  const source = await read("features/automatic-booking/automatic-booking-experience.tsx");
  const resolver = await read("features/capacity/progressive-availability.ts");
  for (const text of ["DISPONIBILIDAD DE TU FECHA", "HORARIO DISPONIBLE", "ESTE HORARIO YA NO SE ENCUENTRA DISPONIBLE", "ESTAMOS CONFIRMANDO TU DISPONIBILIDAD", "Selecciona un servicio para completar la validación.", "canConfirm"]) assert.match(`${source}\n${resolver}`, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(source, /caseCapacity|bboxCapacity|CASE.*disponibles/i);
});
