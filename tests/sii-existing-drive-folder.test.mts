import assert from "node:assert/strict";
import test from "node:test";
import { resolveExistingBillingFolder } from "../features/connectors/google-drive/application/existing-billing-folder.ts";

test("uses the billing folder under the existing event without touching obsolete month folders", async () => {
  const calls: string[] = [];
  const id = await resolveExistingBillingFolder({ eventFolderId: "event", storedFolderId: "billing", provider: {
    async getFolderParents(id) { calls.push(id); return id === "billing" ? ["event"] : ["consolidated-month"]; },
    async findFolder() { throw new Error("unnecessary lookup"); },
  } });
  assert.equal(id, "billing");
  assert.deepEqual(calls, ["event", "billing"]);
});
test("recovers a stale billing reference only within the verified event", async () => {
  const id = await resolveExistingBillingFolder({ eventFolderId: "event", storedFolderId: "stale", provider: {
    async getFolderParents(id) { if (id === "stale") throw new Error("Google Drive parent lookup failed (404)"); return id === "billing" ? ["event"] : ["month"]; },
    async findFolder(input) { assert.deepEqual(input, { name: "07_Facturación", parentFolderId: "event" }); return { id: "billing", name: input.name }; },
  } });
  assert.equal(id, "billing");
});
test("permission failures do not trigger folder recovery or creation", async () => {
  await assert.rejects(resolveExistingBillingFolder({ eventFolderId: "event", storedFolderId: "billing", provider: {
    async getFolderParents(id) { if (id === "billing") throw new Error("Google Drive parent lookup failed (403)"); return ["month"]; },
    async findFolder() { throw new Error("must not search after permission failure"); },
  } }), /403/);
});
test("missing event fails closed without searching or creating folders", async () => {
  await assert.rejects(resolveExistingBillingFolder({ eventFolderId: "missing", provider: {
    async getFolderParents() { throw new Error("Google Drive parent lookup failed (404)"); },
    async findFolder() { throw new Error("must not search outside verified event"); },
  } }), /404/);
});
test("missing billing folder is reported without creating a replacement", async () => {
  await assert.rejects(resolveExistingBillingFolder({ eventFolderId: "event", provider: {
    async getFolderParents() { return ["month"]; },
    async findFolder() { return null; },
  } }), /no se creó ninguna carpeta/);
});
test("a misplaced stored billing folder cannot be used for upload", async () => {
  await assert.rejects(resolveExistingBillingFolder({ eventFolderId: "event", storedFolderId: "other", provider: {
    async getFolderParents() { return ["another-event"]; },
    async findFolder() { return { id: "also-wrong", name: "07_Facturación" }; },
  } }), /no pertenece al evento/);
});
