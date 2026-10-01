import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Founder action center exposes persistent LISTO controls without deleting source records", () => {
  const workspace = source("features/founder-workspace/founder-workspace-experience.tsx");
  const action = source("features/founder-action-center/actions.ts");
  const loader = source("features/founder-action-center/index.ts");

  assert.match(workspace, />LISTO</);
  assert.match(workspace, /LISTO GRUPO/);
  assert.match(workspace, /dismissFounderActionsAction/);
  assert.match(action, /founder_action_user_states/);
  assert.match(action, /upsert/);
  assert.doesNotMatch(action, /internal_notifications"\)\.delete|accounts_receivable_projection"\)\.delete/);
  assert.match(loader, /loadFounderActionDismissals/);
  assert.match(loader, /dismissed\.has\(item\.id\)/);
});
