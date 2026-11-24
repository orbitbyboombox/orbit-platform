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


test("optimized staff aggregation preserves the legacy result across deterministic fixtures", () => {
  type Member = { id: string };
  type Assignment = { staffId: string | null; type: string; status: string };
  const legacy = (members: Member[], assignments: Assignment[], skill: string) =>
    members.map((member) => ({
      member, count: assignments.filter((item) =>
        item.staffId === member.id && item.type === skill && item.status === "COMPLETED"
      ).length,
    })).sort((a, b) => b.count - a.count)[0];
  const optimized = (members: Member[], assignments: Assignment[], skill: string) => {
    const counts = new Map<string, number>();
    for (const item of assignments) {
      if (item.status !== "COMPLETED" || !item.staffId) continue;
      const key = `${item.type}:${item.staffId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return members.map((member) => ({
      member, count: counts.get(`${skill}:${member.id}`) ?? 0,
    })).sort((a, b) => b.count - a.count)[0];
  };
  let seed = 218;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let run = 0; run < 2000; run += 1) {
    const members = Array.from({ length: Math.floor(random() * 20) }, (_, id) => ({ id: `S${id}` }));
    const assignments = Array.from({ length: Math.floor(random() * 80) }, () => ({
      staffId: members.length && random() > 0.1 ? members[Math.floor(random() * members.length)].id : null,
      type: ["OPERATOR", "ASSEMBLY", "DISASSEMBLY"][Math.floor(random() * 3)],
      status: ["COMPLETED", "PENDING", "REJECTED", "CANCELLED"][Math.floor(random() * 4)],
    }));
    for (const skill of ["OPERATOR", "ASSEMBLY"]) {
      assert.deepEqual(optimized(members, assignments, skill), legacy(members, assignments, skill));
    }
  }
});
