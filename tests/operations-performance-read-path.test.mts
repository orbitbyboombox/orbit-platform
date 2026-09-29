import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("app/(platform)/operations/page.tsx", "utf8");

test("Operations reuses its filtered project read instead of the global customer repository", () => {
  assert.doesNotMatch(source, /new SupabaseCustomerRepository\(client\)\.findAll\(\)/);
  assert.match(source, /from\("projects"\)[\s\S]*project_type,status,event_date/);
  assert.match(source, /const allProjects: Project\[\] = \(rawProjectsResult\.data \?\? \[\]\)\.map/);
});
