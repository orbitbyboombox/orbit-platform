import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const copyCard = readFileSync(
  new URL("../app/datos-bancarios/bank-details-copy-card.tsx", import.meta.url),
  "utf8",
);
const reminderControl = readFileSync(
  new URL(
    "../features/projects/communications/pre-event-reminder-control.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("bank copy is isolated from parent actions and reports success", () => {
  assert.match(copyCard, /data-testid="copy-bank-details"/);
  assert.match(copyCard, /type="button"/);
  assert.match(copyCard, /event\.preventDefault\(\)/);
  assert.match(copyCard, /event\.stopPropagation\(\)/);
  assert.match(copyCard, /bankText\(bank\)/);
  assert.match(copyCard, /✓ DATOS COPIADOS/);
  assert.match(copyCard, /aria-live="polite"/);
  assert.doesNotMatch(copyCard, /sendPreEventReminderAction|getPreEventReminderPreviewAction/);
});

test("reminder action remains separate from the bank copy control", () => {
  assert.match(reminderControl, /sendPreEventReminderAction/);
  assert.match(reminderControl, /requestDelivery/);
  assert.match(reminderControl, /REENVIAR RECORDATORIO/);
  assert.doesNotMatch(copyCard, /setOpen\(|setConfirmingResend\(|sendPreEventReminderAction/);
});
