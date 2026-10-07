import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync("features/staff-monthly-account/actions.ts", "utf8");
const dialog = readFileSync("components/ui/mobile-dialog.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261007170000_group_staff_advance_by_event.sql", "utf8");
const financialActions = readFileSync("features/staff-payments/staff-financial-actions.tsx", "utf8");

test("grouped advance sanitizes receipt storage keys and preserves original display names", () => {
  assert.match(actions, /safeStorageFileName/);
  assert.match(actions, /receiptPath = `staff\/advances\/\$\{staffId\}\/\$\{projectId\}\/\$\{idempotencyKey\}\/\$\{safeStorageFileName\(receipt\.file\.name\)\}`/);
  assert.match(actions, /p_receipt_file_name: receipt\.file\.name/);
  assert.match(actions, /boleta-\$\{safeStorageFileName\(boleta\.file\.name, "boleta"\)\}/);
  assert.match(migration, /register_staff_grouped_advance_with_documents/);
});

test("grouped advance remains idempotent, allocated, and protected by the canonical RPC", () => {
  assert.match(financialActions, /JSON\.stringify\(allocationPlan\)/);
  assert.match(financialActions, /selectedGroup\.concepts/);
  assert.match(actions, /p_idempotency_key: idempotencyKey/);
  assert.match(migration, /legacy_source like 'staff-grouped-advance:/);
  assert.match(migration, /on conflict\(correlation_id\) do nothing/);
});

test("amount input is not remounted by modal focus management", () => {
  assert.match(dialog, /onCloseRef = useRef\(onClose\)/);
  assert.match(dialog, /onCloseRef\.current\(\)/);
  assert.match(dialog, /\}, \[\]\);/);
  assert.match(financialActions, /name="amount"[^>]*onChange=/);
});

test("special filenames are converted to safe storage keys", () => {
  const source = actions;
  assert.match(source, /normalize\("NFKD"\)/);
  assert.match(source, /replace\(\/\[\^a-zA-Z0-9\._-\]\+\/g, "-"\)/);
  assert.doesNotMatch(source, /staff\/advances\/\$\{staffId\}\/\$\{projectId\}\/\$\{idempotencyKey\}\/\$\{receipt\.file\.name\}/);
});
