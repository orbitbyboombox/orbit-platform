import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("ORBIT BOOMBOX release identifies itself as v2.0", () => {
  assert.match(read("package.json"), /"version": "2\.0\.0"/);
  assert.match(read("app/page.tsx"), /ORBIT BOOMBOX v2\.0/);
  assert.match(read("features/company-settings/types.ts"), /productVersion:"v2\.0"/);
});

test("receipt Content-Disposition remains ASCII-safe while preserving UTF-8 filename", () => {
  const route = read("app/api/staff-monthly-accounts/[accountId]/receipt/route.ts");
  assert.match(route, /filename\*=UTF-8''/);
  assert.match(route, /asciiFileName/);
  assert.match(route, /encodeURIComponent/);
});

test("post-reservation extras use immediate canonical propagation", () => {
  const action = read("features/projects/actions/event-extras.actions.ts");
  assert.match(action, /propagateCanonicalEventChange/);
  assert.match(action, /revalidatePath\("\/staff-portal"\)/);
  assert.match(action, /revalidatePath\("\/operations"\)/);
});

test("Calendar fingerprint schema v3 forces canonical-format refresh", () => {
  assert.match(
    read("features/connectors/google-calendar/application/canonical-calendar-fingerprint.ts"),
    /CALENDAR_CANONICAL_SCHEMA_VERSION = "v3"/,
  );
});


test("Operations uses compact Drive readiness projection", () => {
  const source = read("app/(platform)/operations/page.tsx");
  assert.match(source, /rpc\("operations_drive_ready_projects"\)/);
  assert.doesNotMatch(source, /from\("drive_sync"\)/);
  assert.doesNotMatch(source, /from\("documents"\)/);
});
