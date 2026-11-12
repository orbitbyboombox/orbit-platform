import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
test('legacy LISTO delegates to canonical validation without hiding active records',()=>{
  const action=readFileSync('features/founder-action-center/actions.ts','utf8');
  assert.match(action,/validateFounderActions\(actionKeys\)/);
  assert.doesNotMatch(action,/\.upsert\(|\.delete\(|\.update\(/);
});
