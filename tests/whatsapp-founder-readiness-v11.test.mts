import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync("supabase/migrations/0228_whatsapp_founder_alerts.sql", "utf8");
const actions = readFileSync("features/founder-action-center/index.ts", "utf8");
const workspace = readFileSync("features/founder-workspace/founder-workspace-experience.tsx", "utf8");

test("defines canonical idempotent alerts and safe closure", () => {
  assert.ok(migration.includes("reconcile_whatsapp_founder_alerts"));
  assert.ok(migration.includes("WHATSAPP_WAITING_FOR_BOOMBOX"));
  assert.ok(migration.includes("WHATSAPP_HUMAN_STALE"));
  assert.ok(migration.includes("WHATSAPP_UNREAD_CRITICAL"));
  assert.ok(migration.includes("on conflict(correlation_id) do update"));
  assert.ok(migration.includes("status='RESOLVED'"));
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
});
test("registers WhatsApp types in Founder reconciler", () => {
  assert.ok(actions.includes("WHATSAPP_WAITING_FOR_BOOMBOX"));
  assert.ok(actions.includes("WHATSAPP_HUMAN_STALE"));
  assert.ok(actions.includes("WHATSAPP_UNREAD_CRITICAL"));
  assert.ok(actions.includes("WHATSAPP_WAITING_FOR_BOOMBOX"));
  assert.ok(actions.includes("WHATSAPP_HUMAN_STALE"));
  assert.ok(actions.includes("WHATSAPP_UNREAD_CRITICAL"));
});
test("renders the compact BIANCA summary with the waiting count and safe internal CTA", () => {
  const card = workspace.slice(workspace.indexOf("const biancaCard"), workspace.indexOf("const position"));
  assert.match(card, /Necesitan atención[\s\S]*\{whatsappSummary\.waitingBoombox\}/);
  assert.match(card, /Delivery: OFF/);
  assert.match(card, /href="\/bianca"[\s\S]*ABRIR BIANCA/);
  assert.match(workspace, /key: "DASHBOARD_BIANCA"[\s\S]*content: biancaCard/);
});
