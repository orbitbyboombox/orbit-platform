import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("drive repair route is protected by an administrative role guard", async () => {
  const page = await readFile("app/(platform)/resources/drive-repair/page.tsx", "utf8");
  const action = await readFile("features/connectors/google-drive/actions/document-backup-repair.actions.ts", "utf8");

  assert.match(page, /isAdministrativeRole\(profile\?\.role\)/);
  assert.match(page, /redirect\("\/resources"\)/);
  assert.match(action, /isAdministrativeRole\(profile\?\.role\)/);
  assert.match(action, /Solo Founder o Administración/);
});
