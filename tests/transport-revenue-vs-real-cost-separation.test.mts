import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/0162_transport_revenue_vs_real_cost_separation.sql",
  "utf8",
);
const migrationFix = readFileSync(
  "supabase/migrations/0163_transport_real_cost_default_fix.sql",
  "utf8",
);
const eventProfitabilityPanel = readFileSync(
  "features/projects/components/event-profitability-panel.tsx",
  "utf8",
);
const realCostOverridePanel = readFileSync(
  "features/projects/components/real-cost-override-panel.tsx",
  "utf8",
);
const customerEventOperations = readFileSync(
  "features/crm/customer-event-operations.tsx",
  "utf8",
);
const customerOperationsRepository = readFileSync(
  "features/crm/customer-operations.repository.ts",
  "utf8",
);
const projectWorkspaceExperience = readFileSync(
  "features/projects/components/project-workspace-experience.tsx",
  "utf8",
);
const customerSigningExperience = readFileSync(
  "features/projects/signing/customer-signing-experience.tsx",
  "utf8",
);
const customerContractExperience = readFileSync(
  "features/customer-portal/customer-contract-experience.tsx",
  "utf8",
);
const profitabilityExperience = readFileSync(
  "features/profit-engine/components/profitability-experience.tsx",
  "utf8",
);
const costMasterCenter = readFileSync(
  "features/settings/master-data/cost-master-center.tsx",
  "utf8",
);

test("transport revenue stays customer-facing while real transport cost uses the canonical override", () => {
  assert.match(migration, /create or replace function public\.default_real_transport_cost\(\)/i);
  assert.match(migration, /DEFAULT_TRANSPORT_COST/);
  assert.match(migration, /20000::numeric/);
  assert.match(migration, /select public\.default_real_transport_cost\(\) into transport_value;/i);
  assert.match(migration, /coalesce\(real_transport,estimate\.transport,public\.default_real_transport_cost\(\)\)/i);
  assert.match(migration, /if exists\(select 1 from public\.event_operational_closures where project_id=p_project_id and status='CLOSED'\) then return; end if;/i);
  assert.doesNotMatch(
    migration,
    /from public\.commercial_prices where category='TRANSPORT'/i,
  );
  assert.match(migrationFix, /coalesce\(real_transport,public\.default_real_transport_cost\(\)\)/i);
  assert.match(migrationFix, /coalesce\(real_transport,public\.default_real_transport_cost\(\)\)/i);
  assert.doesNotMatch(migrationFix, /coalesce\(real_transport,estimate\.transport,public\.default_real_transport_cost\(\)\)/i);
});

test("transport labels are explicit across the surfaced UI", () => {
  assert.match(eventProfitabilityPanel, /Traslado cobrado al cliente/);
  assert.match(eventProfitabilityPanel, /Costo estimado transporte/);
  assert.match(eventProfitabilityPanel, /Costo real transporte/);
  assert.match(realCostOverridePanel, /Costo real transporte/);
  assert.match(customerEventOperations, /Traslado cobrado al cliente/);
  assert.match(customerOperationsRepository, /Costo real transporte/);
  assert.match(projectWorkspaceExperience, /Traslado cobrado al cliente/);
  assert.match(projectWorkspaceExperience, /Costo estimado transporte/);
  assert.match(customerSigningExperience, /Traslado cobrado al cliente/);
  assert.match(customerContractExperience, /Traslado cobrado al cliente/);
  assert.match(profitabilityExperience, /Costo real transporte/);
  assert.match(costMasterCenter, /Transporte real/);
});

test("transport revenue and transport cost remain distinct concepts", () => {
  assert.doesNotMatch(eventProfitabilityPanel, /labelOverrides=\{\{\s*transport:\s*"Transporte"\s*\}\}/i);
  assert.match(customerContractExperience, /quotation\?\.transport_total/);
  assert.match(customerSigningExperience, /props\.transport/);
  assert.match(customerOperationsRepository, /\["transport", "Costo real transporte", "OPERATIONAL"\]/);
});
