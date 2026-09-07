import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("shared capacity panel presents canonical states and fails closed", async () => {
  const source = await read("features/capacity/capacity-status-panel.tsx");
  for (const value of ["AVAILABLE", "UNAVAILABLE", "REVIEW_REQUIRED", "VALIDANDO DISPONIBILIDAD", "SIN DISPONIBILIDAD", "REQUIERE REVISIÓN"]) assert.match(source, new RegExp(value));
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
  assert.match(drawer, /data-capacity-section/);
  assert.ok(drawer.indexOf("data-capacity-section") < drawer.indexOf("data-reservation-wizard-scroll"));
  for (const field of ["draft.event.date", "draft.event.time", "draft.event.durationHours", "eventAddress", "draft.event.city", "draft.services"]) assert.match(drawer, new RegExp(field.replaceAll(".", "\\.")));
  assert.match(drawer, /requestId !== capacityRequest.current/);
});
