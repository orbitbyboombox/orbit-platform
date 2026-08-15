import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(`${root}/supabase/migrations/0129_operations_phase_d_staff_execution.sql`, "utf8");
const portal = readFileSync(`${root}/features/portal-authentication/staff-portal-dashboard.tsx`, "utf8");
const staffProjection = readFileSync(`${root}/features/portal-authentication/staff-portal.tsx`, "utf8");
const timelineFix = readFileSync(`${root}/supabase/migrations/0131_operations_phase_d_timeline_source.sql`, "utf8");
const cancellation = readFileSync(`${root}/supabase/migrations/0109_rc52_5_staff_cancellation_recovery.sql`, "utf8");
const requestWorkflow = readFileSync(`${root}/supabase/migrations/0090_rc30b_staff_request_workflow.sql`, "utf8");
const packageDelivery = readFileSync(`${root}/features/operations/smart-assignment-package.service.ts`, "utf8");
const reviewAction = readFileSync(`${root}/features/operations/operations-planning.actions.ts`, "utf8");

test("Phase D preserves one canonical assignment and settlement transaction", () => {
  assert.match(migration, /assign_event_operational_responsibility/);
  assert.match(migration, /refresh_staff_event_payment/);
  assert.match(migration, /event_staff_payments set status='CONFIRMED'/);
  assert.doesNotMatch(migration, /create table if not exists public\.(staff_assignments|staff_settlements)/);
});

test("staff demand supports independent quantities and publication per role", () => {
  assert.match(migration, /unique\(project_id,role\)/);
  assert.match(migration, /required_quantity integer/);
  assert.match(migration, /assigned_count>=required_count/);
  assert.match(staffProjection, /event_staff_requirements/);
});

test("Portal Staff execution is role-aware and shares arrival", () => {
  for (const action of ["ARRIVED", "ASSEMBLY_STARTED", "ASSEMBLY_COMPLETED", "EVENT_STARTED", "EVENT_FINISHED", "DISASSEMBLY_STARTED", "DISASSEMBLY_COMPLETED"])
    assert.match(portal, new RegExp(action));
  assert.match(portal, /executionActions\(event\.roles\)/);
  assert.match(portal, /participationCompleted/);
});

test("availability stays private before canonical confirmation", () => {
  assert.match(staffProjection, /staff_available_event_projection/);
  assert.match(staffProjection, /customer:"Evento BOOMBOX"/);
  assert.match(staffProjection, /clientPhone:"Disponible después de confirmación"/);
  assert.match(staffProjection, /address:"Disponible después de confirmación"/);
});

test("multiple slots reject overflow without creating a duplicate assignment", () => {
  assert.match(migration, /assigned_count>=required_count/);
  assert.match(migration, /capacity_full/);
  assert.match(migration, /review_reason='Cupo cubierto'/);
  assert.match(requestWorkflow, /staff_assignment_requests_pending_uq/);
});

test("rejection preserves the request and creates no assignment", () => {
  assert.match(migration, /if not p_approved then update public\.staff_assignment_requests set status='REJECTED'/);
  assert.match(migration, /return jsonb_build_object\('requestId',req\.id,'status','REJECTED'\)/);
});

test("cancellation and replacement retain canonical audit history", () => {
  assert.match(cancellation, /staff_assignment_cancellations/);
  assert.match(cancellation, /status='CANCELLED',deleted_at=now\(\)/);
  assert.match(cancellation, /republish_allowed/);
  assert.match(migration, /status not in\('CANCELLED','REJECTED'\)/);
});

test("Phase D timeline writes use the accepted Staff source", () => {
  assert.match(timelineFix, /actor_label,source/);
  assert.match(timelineFix, /'Staff','Staff',p_status/);
  assert.doesNotMatch(timelineFix, /'Staff','StaffPortal',p_status/);
  assert.doesNotMatch(packageDelivery, /source:"StaffAssignment"/);
  assert.match(packageDelivery, /source:"Operations"/);
});

test("approval and rejection both produce Staff-facing notifications", () => {
  assert.match(packageDelivery, /notification_type:"SMART_ASSIGNMENT_PACKAGE"/);
  assert.match(reviewAction, /notification_type:"STAFF_REQUEST_REJECTED"/);
  assert.match(reviewAction, /staff-request-rejected:/);
});

test("payment and RLS paths remain isolated", () => {
  assert.match(migration, /event_staff_payments set status='CONFIRMED'/);
  assert.match(migration, /grant execute on function public\.request_staff_responsibility.*to service_role/);
  assert.match(migration, /grant execute on function public\.review_staff_assignment_request.*to authenticated/);
  assert.doesNotMatch(staffProjection, /other_staff_payment|gross_margin|sale_total/i);
});
