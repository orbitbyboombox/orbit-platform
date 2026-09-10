import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("commercial capacity uses one CASE pool regardless of shell", () => {
  const migration = read("supabase/migrations/0252_capacity_shell_operational_only.sql");
  assert.match(migration, /create or replace function public\._preflight_draft_capacity_core/);
  assert.match(migration, /create or replace function public\.preflight_reservation_capacity/);
  assert.doesNotMatch(migration, /SHELL_CONFIGURATION_REQUIRED/);
  assert.doesNotMatch(migration, /WHITE_SHELL_CAPACITY_EXCEEDED|BLACK_SHELL_CAPACITY_EXCEEDED/);
  assert.match(migration, /asset_type='CASE'/);
  assert.match(migration, /asset_type='BBOX360'/);
});

test("automatic booking does not expose or require shell selection", () => {
  const experience = read("features/automatic-booking/automatic-booking-experience.tsx");
  const completion = read("features/automatic-booking/complete-automatic-booking.service.ts");
  assert.doesNotMatch(experience, /initialShell|event\.shell|shell: initialShell/);
  assert.doesNotMatch(completion, /La configuración física requiere revisión/);
  assert.match(experience, /serviceCodes:\[service\.code\]/);
});

test("manual confirmation keeps shell as operational metadata only", () => {
  const drawer = read("features/projects/components/new-project-drawer.tsx");
  assert.match(drawer, /Asignación operacional independiente del servicio comercial/);
  assert.doesNotMatch(drawer, /shellSelectionRequired/);
});
