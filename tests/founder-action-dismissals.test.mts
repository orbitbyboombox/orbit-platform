import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
test('legacy LISTO delegates to canonical validation without hiding active records',()=>{
  const action=readFileSync('features/founder-action-center/actions.ts','utf8');
  const legacyAction = action.slice(action.indexOf('export async function dismissFounderActionsAction'), action.indexOf('import { requireDiagnosticAdmin'));
  assert.match(legacyAction,/validateFounderActions\(actionKeys\)/);
  assert.doesNotMatch(legacyAction,/\.upsert\(|\.delete\(|\.update\(/);
  const acknowledge = action.slice(action.indexOf("export async function acknowledgeFounderAction"));
  assert.match(acknowledge,/user_id: userId, action_key: id/);
  assert.ok(acknowledge.indexOf("await requireDiagnosticAdmin()") < acknowledge.indexOf(".upsert("));
  assert.ok(acknowledge.indexOf("await loadActionDiagnostic(id)") < acknowledge.indexOf(".upsert("));
  assert.doesNotMatch(acknowledge,/internal_notifications|\.delete\(|\.update\(/);
});
