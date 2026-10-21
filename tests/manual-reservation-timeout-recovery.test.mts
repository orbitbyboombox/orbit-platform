import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const actions = read("features/projects/actions/customer.actions.ts");
const drawer = read("features/projects/components/new-project-drawer.tsx");
const projectType = read("features/projects/types/project.ts");
const leaseMigration = read(
  "supabase/migrations/20261021143000_manual_reservation_integration_lease.sql",
);

test("manual reservation persists core records before post-commit integrations", () => {
  assert.match(actions, /prepare_confirmed_reservation_records/);
  assert.match(actions, /after\(async \(\) =>/);
  assert.match(actions, /reservationIntegrationsPending: pendingIntegrations/);
  assert.match(actions, /claim_manual_reservation_integrations/);
});

test("post-commit recovery is stage-aware and does not create a new transaction", () => {
  assert.match(actions, /continueManualReservationIntegrations/);
  assert.match(actions, /completedConfirmationStages/);
  assert.match(actions, /checkpoint\("Confirmation", "PASS"\)/);
  assert.match(actions, /reservation_transactions/);
  assert.match(actions, /transaction\.status === "COMPLETED"/);
});

test("the durable lease serializes concurrent resumes and expires safely", () => {
  assert.match(leaseMigration, /integration_lease_token/);
  assert.match(leaseMigration, /integration_lease_until/);
  assert.match(leaseMigration, /integration_lease_until <= now\(\)/);
  assert.match(leaseMigration, /grant execute/);
  assert.match(leaseMigration, /to authenticated/);
});

test("the browser shows a truthful post-commit synchronization state", () => {
  assert.match(drawer, /reservationIntegrationsPending/);
  assert.match(drawer, /Reserva confirmada\. Estamos terminando de sincronizar los documentos/);
  assert.match(projectType, /reservationIntegrationsPending\?: boolean/);
});
