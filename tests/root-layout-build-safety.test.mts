import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const layout = fs.readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const bankDetails = fs.readFileSync(new URL("../app/datos-bancarios/page.tsx", import.meta.url), "utf8");
const repository = fs.readFileSync(new URL("../features/company-settings/repository.ts", import.meta.url), "utf8");

test("public root layout uses the build-safe settings loader", () => {
  assert.match(layout, /loadCompanySettingsForLayout/);
  assert.doesNotMatch(layout, /loadCompanySettingsCached/);
  assert.doesNotMatch(layout, /createAdminClient/);
  assert.match(bankDetails, /loadCompanySettingsForLayout/);
  assert.doesNotMatch(bankDetails, /loadCompanySettingsCached/);
});

test("layout fallback never substitutes an administrative credential", () => {
  assert.match(repository, /if\s*\(!adminKey\)\s*return DEFAULT_COMPANY_SETTINGS/);
  assert.match(repository, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(repository, /return loadCompanySettingsCached\(\)/);
});
