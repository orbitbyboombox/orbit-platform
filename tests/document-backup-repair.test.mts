import test from "node:test";
import assert from "node:assert/strict";
import { buildCustomerFolderPlan } from "../features/connectors/google-drive/application/google-drive-folder-strategy.ts";
import { InMemoryGoogleDriveLiveProvider } from "../features/connectors/google-drive/provider/google-drive-live.provider.ts";

test("document repair derives a deterministic canonical event path", () => {
  const plan = buildCustomerFolderPlan("The Match Spa", "2026-09-17", "BOOMBOX ORBIT");
  assert.equal(plan[2].path, "BOOMBOX ORBIT/2026/September/17-09-2026 - The Match Spa");
  assert.equal(plan.find((item) => item.name === "02_Comprobantes")?.path, "BOOMBOX ORBIT/2026/September/17-09-2026 - The Match Spa/02_Comprobantes");
});

test("drive provider preserves the document identity metadata used for idempotent reconciliation", async () => {
  const drive = new InMemoryGoogleDriveLiveProvider();
  const file = await drive.uploadFile({ name: "receipt.png", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]), parentFolderId: "folder-1", appProperties: { orbitDocumentId: "doc-1", orbitStorageChecksum: "sha256" } });
  const files = await drive.findFilesByName?.({ name: "receipt.png", parentFolderId: "folder-1" });
  assert.equal(file.id, files?.[0]?.id);
  assert.equal(files?.[0]?.appProperties?.orbitDocumentId, "doc-1");
  assert.equal(files?.[0]?.size, "3");
});

test("reusing an existing provider record does not create another file for the same identity", async () => {
  const drive = new InMemoryGoogleDriveLiveProvider();
  const input = { name: "receipt.png", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]), parentFolderId: "folder-1", appProperties: { orbitDocumentId: "doc-1" } };
  const first = await drive.uploadFile(input);
  const existing = (await drive.findFilesByName?.({ name: input.name, parentFolderId: input.parentFolderId }))?.find((item) => item.appProperties?.orbitDocumentId === "doc-1");
  assert.equal(existing?.id, first.id);
  assert.equal((await drive.findFilesByName?.({ name: input.name, parentFolderId: input.parentFolderId }))?.length, 1);
});
