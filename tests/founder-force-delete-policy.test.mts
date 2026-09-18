import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const policy = readFileSync("features/founder-force-delete/policy.ts", "utf8");
const action = readFileSync("features/projects/actions/reservation-lifecycle.actions.ts", "utf8");
const crm = readFileSync("features/crm/actions.ts", "utf8");
const bridge = readFileSync("supabase/migrations/20260918000000_founder_force_delete_legacy_bridge.sql", "utf8");

test("Founder Force Delete uses one confirmation policy and CEO-only authorization", () => {
  assert.match(policy, /FOUNDER_FORCE_DELETE_CONFIRMATION = "ELIMINAR"/);
  assert.match(policy, /role === "CEO"/);
  assert.match(action, /founderForceDeleteEventAction/);
  assert.match(action, /profile\?\.role !== "CEO"/);
  assert.match(crm, /input\.action === "PERMANENT_DELETE"/);
});

test("legacy event purge calls converge on the four-argument saga", () => {
  assert.match(bridge, /drop function if exists public\.purge_event_controlled\(uuid, text, text\)/i);
  assert.match(bridge, /p_delete_orphan_customer/);
  assert.match(bridge, /security invoker/i);
});

test("force-delete errors are structured and never stringify as object placeholders", () => {
  assert.match(policy, /JSON\.stringify\(value\)/);
  assert.doesNotMatch(policy, /\[object Object\]/);
});
