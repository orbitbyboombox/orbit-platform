import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("worker is durable, protected, and scheduled without sending customer email", () => {
  const worker = read("features/projects/operations/manual-reservation-integrations-worker.service.ts");
  const route = read("app/api/cron/manual-reservation-integrations/route.ts");
  const config = read("vercel.json");

  assert.match(worker, /reservation_method.*MANUAL/);
  assert.match(worker, /integration_next_attempt_at/);
  assert.match(worker, /integration_attempt_count/);
  assert.match(worker, /internalWorker:\s*true/);
  assert.match(worker, /customerEmailSuppressed:\s*true/);
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /Bearer/);
  assert.match(config, /manual-reservation-integrations/);
  assert.match(config, /\*\/5 \* \* \* \*/);
});

test("worker records lease-safe stages and never enables historical customer email", () => {
  const action = read("features/projects/actions/customer.actions.ts");
  const migration = read("supabase/migrations/20261021150000_manual_reservation_worker_state.sql");

  assert.match(action, /sendCustomerCommunication:\s*false/);
  assert.match(action, /record_manual_reservation_integration/);
  assert.match(action, /release_manual_reservation_integration/);
  assert.match(action, /stage === "TIMELINE"/);
  assert.match(action, /values\.has\("Timeline"\)/);
  assert.match(migration, /integration_lease_until/);
  assert.match(migration, /for update/i);
  assert.match(migration, /service_role/);
  assert.match(migration, /coalesce\(integration_attempt_count, 0\) < 8/);
  assert.match(migration, /actor_id = auth\.uid\(\) or public\.can_administer\(\)/);
  assert.match(migration, /least\(greatest\(coalesce\(p_next_attempt_seconds, 30\), 30\), 3600\)/);
  assert.match(migration, /Customer Email/);
});

test("completed transactions with pending customer email remain pending and are not worker candidates", () => {
  const action = read("features/projects/actions/customer.actions.ts");
  const worker = read("features/projects/operations/manual-reservation-integrations-worker.service.ts");
  const drawer = read("features/projects/components/new-project-drawer.tsx");

  assert.match(action, /transaction\.status === "COMPLETED"/);
  assert.match(action, /sendCustomerCommunication:\s*false/);
  assert.match(action, /Customer Email/);
  assert.match(worker, /\.in\("status", \["CREATED", "PROCESSING", "FAILED"\]\)/);
  assert.match(drawer, /Confirmación cliente pendiente de envío/);
  assert.doesNotMatch(drawer, /Customer Email.*enviado/);
});
