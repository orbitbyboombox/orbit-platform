import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/(platform)/operations/page.tsx", import.meta.url), "utf8");

test("Operations keeps a slow-read latency signal without exposing database payload", () => {
  assert.match(source, /operations_initial_read_ms/);
  assert.match(source, /operationsDataLoadMs > 1500/);
  assert.match(source, /durationMs: operationsDataLoadMs/);
});

test("Operations aggregates completed staff assignments once, preserving staff ordering", () => {
  assert.match(source, /const completedCountBySkillAndStaff = new Map<string, number>\(\)/);
  assert.match(source, /item.status !== "COMPLETED"/);
  assert.match(source, /count: completedCountBySkillAndStaff.get/);
  assert.doesNotMatch(
    source.slice(source.indexOf("const countBySkill ="), source.indexOf("const topOperator =")),
    /assignments\.filter/,
  );
});
