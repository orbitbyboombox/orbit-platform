import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync("features/connectors/google-drive/application/document-backup-repair.service.ts", "utf8");
const action = readFileSync("features/connectors/google-drive/actions/document-backup-repair.actions.ts", "utf8");
const page = readFileSync("app/(platform)/resources/drive-repair/page.tsx", "utf8");

test("Drive checksum comparison uses Google hexadecimal MD5 and verifies uploaded files", () => {
  assert.match(service, /digest\("hex"\)/);
  assert.match(service, /md5Checksum\?\.toLowerCase\(\) === checksum/);
  assert.match(service, /reconcileAfterUpload/);
  assert.match(service, /orbitDocumentId/);
});

test("repair is explicit, admin-protected and idempotent", () => {
  assert.match(action, /isAdministrativeRole/);
  assert.match(action, /Selecciona explícitamente un ID/);
  assert.match(service, /\.is\("drive_file_id", null\)/);
  assert.match(service, /\.eq\("id", document\.id\)\.is\("drive_file_id", null\)/);
  assert.match(page, /Reparar documento seleccionado/);
  assert.match(page, /repairPendingDocumentBackupsAction\(\[documentId\]\)/);
});
