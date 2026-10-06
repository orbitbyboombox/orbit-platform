import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile("features/portal-authentication/staff-portal-dashboard.tsx", "utf8");

test("Staff Portal prioritizes assigned operational block times", () => {
  assert.match(dashboard, /const assignedBlocks = event\.roles\.includes\("OPERATOR"\) \? event\.operationalBlocks : \[\];/);
  assert.match(dashboard, /time: primaryBlock \? staffBlockTime\(primaryBlock\.startAt\) : event\.start/);
  assert.match(dashboard, /endTime: primaryBlock \? staffBlockTime\(primaryBlock\.endAt\) : event\.finish/);
  assert.match(dashboard, /TU TURNO:/);
  assert.match(dashboard, /EVENTO TOTAL/);
});

test("traditional events retain parent event fallback", () => {
  assert.match(dashboard, /primaryBlock \? staffBlockTime\(primaryBlock\.startAt\) : event\.start/);
  assert.match(dashboard, /primaryBlock \? staffBlockTime\(primaryBlock\.endAt\) : event\.finish/);
  assert.match(dashboard, /hasAssignedBlocks \? turnLabel : `\$\{event\.date\} · \$\{event\.start\}–\$\{event\.finish\}`/);
});

