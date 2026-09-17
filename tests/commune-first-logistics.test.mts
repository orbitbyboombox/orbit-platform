import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("automatic booking treats commune as the structured logistics source", async () => {
  const [migration, validation, experience] = await Promise.all([
    read("supabase/migrations/20260917200000_commune_first_capacity_logistics.sql"),
    read("features/automatic-booking/automatic-booking-validation.ts"),
    read("features/automatic-booking/automatic-booking-experience.tsx"),
  ]);
  assert.match(migration, /commune_has_deterministic_logistics/);
  assert.match(migration, /not commune_deterministic/);
  assert.doesNotMatch(validation, /Completa la dirección del evento/);
  assert.match(experience, /event\.municipality && service\.code/);
});

test("BIANCA asks for commune before venue", async () => {
  const source = await read("features/bianca-lab/simulator.ts");
  assert.match(source, /"comuna"/);
  assert.match(source, /"lugar o centro de eventos"/);
});
