import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addOperationalDays, isInsideOperationalWindow } from "../../features/operations/operational-window.ts";

const migration = readFileSync(new URL("../../supabase/migrations/0127_operations_phase_ab.sql", import.meta.url), "utf8");
const eventPage = readFileSync(new URL("../../app/(platform)/projects/[projectId]/page.tsx", import.meta.url), "utf8");
const staffPortal = readFileSync(new URL("../../features/portal-authentication/staff-portal.tsx", import.meta.url), "utf8");

test("confirmed handoff remains on projects and is idempotent", () => {
  assert.match(migration, /project_id uuid not null unique references public\.projects/);
  assert.match(migration, /unique\(project_id,canonical_key\)/);
  assert.match(migration, /on conflict\(project_id,canonical_key\) do update/);
  assert.match(migration, /prepare_confirmed_reservation_records_commercial_core/);
  assert.match(migration, /ensure_event_operational_handoff/);
});

test("commercial and operational states remain separate", () => {
  assert.match(migration, /operational_status text not null default 'PREPARATION'/);
  for (const state of ["PREPARATION", "READY", "IN_PROGRESS", "COMPLETED", "CLOSED"]) assert.match(migration, new RegExp(`'${state}'`));
  assert.match(migration, /crm_reservations where project_id=p_project_id and status='CONFIRMED'/);
});

test("handoff normalizes contact, quantity, requirements and checklist", () => {
  assert.match(migration, /contact_source text not null default 'PENDING'/);
  assert.match(migration, /productionContact/);
  assert.match(migration, /alter table public\.project_services[\s\S]*quantity/);
  assert.match(migration, /'PHYSICAL_UNIT'/);
  assert.match(migration, /'NON_PHYSICAL'/);
  assert.match(migration, /insert into public\.event_checklists/);
});

test("Event render has no checklist bootstrap side effect", () => {
  assert.doesNotMatch(eventPage, /client\.rpc\(\s*["']ensure_event_checklist/);
});

test("readiness returns explicit reasons", () => {
  for (const code of ["RESERVATION", "DATE", "SCHEDULE", "LOCATION", "CONTACT", "SERVICES", "CHECKLIST", "STAFF"]) assert.match(migration, new RegExp(`'${code}'`));
  assert.match(migration, /readiness_reasons jsonb/);
});

test("15-day window uses Chile date and includes both boundaries", () => {
  assert.equal(addOperationalDays("2026-08-15", 15), "2026-08-30");
  assert.equal(isInsideOperationalWindow("2026-08-15", "2026-08-15"), true);
  assert.equal(isInsideOperationalWindow("2026-08-30", "2026-08-15"), true);
  assert.equal(isInsideOperationalWindow("2026-08-31", "2026-08-15"), false);
  assert.equal(isInsideOperationalWindow("2026-08-14", "2026-08-15"), false);
});

test("Staff availability consumes the privacy-safe projection", () => {
  assert.match(staffPortal, /staff_available_event_projection/);
  assert.match(migration, /revoke all on public\.staff_available_event_projection from public,anon,authenticated/);
  assert.doesNotMatch(migration.match(/create or replace view public\.staff_available_event_projection[\s\S]*?revoke all/)?.[0] ?? "", /full_name|phone|email|final_customer_price|margin/);
  assert.match(staffPortal, /Disponible después de confirmación/);
});

test("operational roles remain isolated", () => {
  for (const role of ["OPERATOR", "ASSEMBLY", "DISASSEMBLY"]) assert.match(staffPortal, new RegExp(`"${role}"`));
});
