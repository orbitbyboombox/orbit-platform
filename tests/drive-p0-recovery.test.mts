import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const prefix = "features/connectors/google-drive/";
const reservations = source(prefix + "application/google-drive-sync.service.ts");
const provider = source(prefix + "provider/google-drive-live.provider.ts");
const documents = source(prefix + "application/google-drive-document-routing.service.ts");
const button = source(prefix + "actions/event-drive-sync.actions.ts");
const cleanup = source("features/projects/event-deletion-cleanup.service.ts");

test("an event reference has a date-name leaf and cannot point to its own parent", () => {
  assert.match(reservations, /segments.length === 5/);
  assert.match(reservations, /parent.driveFolderId === previousEvent.external_folder_id/);
});

test("existing folders require the expected physical parent before rename", () => {
  assert.match(reservations, /actualParents\[0\] !== parent.driveFolderId/);
  assert.match(reservations, /updateFolder\(\{ id: previousEvent.external_folder_id, name: eventFolderPlan.name \}\)/);
});

test("new folders carry a stable event code and ambiguous historic names stop creation", () => {
  assert.match(reservations, /const suffix = ` - \$\{project.orbit_event_id\}`/);
  assert.match(reservations, /if \(ambiguousLegacy\) throw/);
});

test("a Drive lookup with multiple answers is rejected", () => {
  assert.match(provider, /body.nextPageToken \|\| \(body.files\?\.length \?\? 0\) > 1/);
});

test("documents resolve their destination inside the verified physical event folder", () => {
  assert.match(documents, /name: leaf, parentFolderId: eventFolder.folderId/);
});

test("archival rejects homonyms with different bytes", () => {
  assert.match(documents, /existing.some\(file => file.md5Checksum !== md5\)/);
});

test("manual reconciliation is restricted and reports incomplete uploads", () => {
  assert.match(button, /\["CEO", "ADMINISTRATOR"\]/);
  assert.match(button, /ok: result.pending === 0/);
});

test("automatic event cleanup preserves physical files and retains Calendar handling", () => {
  assert.match(cleanup, /await deleteCalendarEventForProject/);
  assert.doesNotMatch(cleanup, /deleteFile\?|removeDriveTree|client\.storage/);
});

test("the Drive provider has no permanent delete operation", () => {
  assert.doesNotMatch(provider, /deleteFile|method:\s*"DELETE"/);
});

test("Event 360 Drive recovery routes each current event document type", () => {
  const recovery = source(prefix + "application/event-document-recovery.service.ts");
  for (const type of [
    "COMMERCIAL_DOCUMENT", "CUSTOMER_PURCHASE_ORDER", "DESIGN", "EVENT_DIGITAL_PHOTO_TEMPLATE",
    "EXTERNAL_TAX_DOCUMENT", "PAYMENT_RECEIPT", "PHOTO_STRIP_DESIGN", "SIGNED_AGREEMENT", "STAFF_EXPENSE_RECEIPT",
  ]) {
    assert.match(recovery, new RegExp(`\\["${type}", "`));
  }
  assert.match(button, /recoverPendingEventDocuments\(/);
});

test("document recovery verifies the original and links only an unchanged pending record", () => {
  const recovery = source(prefix + "application/event-document-recovery.service.ts");
  assert.match(recovery, /parents\[0\] !== eventFolder.folderId/);
  assert.match(recovery, /checksum !== document.checksum/);
  assert.ok(recovery.indexOf("checksum !== document.checksum") < recovery.indexOf("await archiveVerifiedDriveFile("));
  assert.match(recovery, /\.eq\("storage_path", document.storage_path\)\.is\("deleted_at", null\)\.is\("drive_file_id", null\)/);
});
