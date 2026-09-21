import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertSingleCommercialEvent,
  calculateOperationalGaps,
  calculatePeakConcurrent,
  buildBlockResourceSegments,
  canDeleteOperationalBlock,
  splitOperationalRequirements,
  findStaffBlockConflicts,
  resolveBlockStaffCosts,
  validateOperationalBlock,
  type OperationalBlock,
} from "../features/operations/operational-blocks.ts";

const migration = readFileSync("supabase/migrations/20260922090000_event_operational_blocks.sql", "utf8");

const block = (id: string, name: string, startAt: string, endAt: string, sequence: number): OperationalBlock => ({ id, projectId: "project-qa", name, startAt, endAt, sequence, status: "PLANNING" });

test("legacy events remain valid without blocks", () => {
  assert.deepEqual(calculateOperationalGaps([]), []);
  assert.equal(calculatePeakConcurrent([]), 0);
  assert.equal(assertSingleCommercialEvent({ quoteId: "q", reservationId: "r", calendarEventCount: 1 }), true);
});

test("AM/PM blocks preserve minute precision and expose the pause gap", () => {
  const blocks = [block("am", "AM", "2026-11-08T12:00:00.000Z", "2026-11-08T16:30:00.000Z", 1), block("pm", "PM", "2026-11-08T18:00:00.000Z", "2026-11-08T22:30:00.000Z", 2)];
  assert.deepEqual(calculateOperationalGaps(blocks)[0].durationMinutes, 90);
  assert.equal(validateOperationalBlock(blocks[0]).length, 0);
});

test("Fantasilandia QA uses America/Santiago AM and PM windows with a 90 minute gap", () => {
  const blocks = [
    block("am", "AM", "2026-11-08T12:00:00.000Z", "2026-11-08T16:30:00.000Z", 1),
    block("pm", "PM", "2026-11-08T18:00:00.000Z", "2026-11-08T22:30:00.000Z", 2),
  ];
  assert.deepEqual(calculateOperationalGaps(blocks), [{ startAt: blocks[0].endAt, endAt: blocks[1].startAt, durationMinutes: 90, label: "PAUSE" }]);
  assert.equal(buildBlockResourceSegments(blocks.map((item) => ({ blockId: item.id, resourceType: "CASE", unitsPerService: 1, serviceQuantity: 7, startAt: item.startAt, endAt: item.endAt }))).length, 2);
});

test("seven units per non-overlapping block peak at seven", () => {
  const segments = [
    { blockId: "am", resourceType: "BLACK_STUDIO", quantity: 7, startAt: "2026-11-08T12:00:00Z", endAt: "2026-11-08T16:30:00Z" },
    { blockId: "pm", resourceType: "BLACK_STUDIO", quantity: 7, startAt: "2026-11-08T18:00:00Z", endAt: "2026-11-08T22:30:00Z" },
  ];
  assert.equal(calculatePeakConcurrent(segments), 7);
  assert.equal(calculatePeakConcurrent([{ ...segments[0], endAt: "2026-11-08T20:00:00Z" }, segments[1]]), 14);
});

test("same staff can work non-overlapping blocks but overlapping blocks conflict", () => {
  const base = { id: "a", staffId: "staff", role: "OPERATOR", blockId: "am", startAt: "2026-11-08T12:00:00Z", endAt: "2026-11-08T16:30:00Z" };
  assert.equal(findStaffBlockConflicts([base, { ...base, id: "b", blockId: "pm", startAt: "2026-11-08T18:00:00Z", endAt: "2026-11-08T22:30:00Z" }]).length, 0);
  assert.equal(findStaffBlockConflicts([base, { ...base, id: "b", blockId: "pm", startAt: "2026-11-08T16:00:00Z", endAt: "2026-11-08T22:30:00Z" }]).length, 1);
});

test("missing 4.5-hour staff tariff requires review and never invents a price", () => {
  assert.deepEqual(resolveBlockStaffCosts([{ blockId: "am", amount: null, status: "REVIEW_REQUIRED" }]), { status: "REVIEW_REQUIRED", total: null });
  assert.deepEqual(resolveBlockStaffCosts([{ blockId: "am", amount: 100, status: "RESOLVED" }, { blockId: "pm", amount: 100, status: "RESOLVED" }]), { status: "RESOLVED", total: 200 });
});

test("commercial invariant rejects multiple Calendar events", () => {
  assert.throws(() => assertSingleCommercialEvent({ quoteId: "q", reservationId: "r", calendarEventCount: 2 }));
});

test("event-level and block-level requirements remain separate and deletes are dependency-safe", () => {
  const split = splitOperationalRequirements([
    { id: "event", scope: "EVENT", blockId: null, requiredQuantity: 1, assignedQuantity: 1 },
    { id: "block", scope: "BLOCK", blockId: "am", requiredQuantity: 7, assignedQuantity: 0 },
  ]);
  assert.equal(split.eventLevel.length, 1);
  assert.equal(split.blockLevel.length, 1);
  assert.equal(canDeleteOperationalBlock({ requirementCount: 1, assignmentCount: 0, assetAssignmentCount: 0 }).allowed, false);
  assert.equal(canDeleteOperationalBlock({ requirementCount: 0, assignmentCount: 0, assetAssignmentCount: 0 }).allowed, true);
});

test("Calendar keeps one event and includes operational blocks in its canonical description", () => {
  const calendarLive = readFileSync("features/connectors/google-calendar/application/google-calendar-live.ts", "utf8");
  assert.match(calendarLive, /PLANIFICACIÓN OPERACIONAL/);
  assert.match(calendarLive, /operationalBlocks/);
  assert.match(calendarLive, /buildCalendarDescription/);
});

test("migration is additive, auditable and does not target production records", () => {
  assert.match(migration, /create table if not exists public\.event_operational_blocks/);
  assert.match(migration, /alter table public\.event_operational_requirements add column if not exists block_id/);
  assert.match(migration, /alter table public\.event_staff_requirements add column if not exists block_id/);
  assert.match(migration, /event_operational_blocks_audit/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /on delete restrict/i);
  assert.match(migration, /delete_event_operational_block/);
  assert.match(migration, /reorder_event_operational_blocks/);
  assert.doesNotMatch(migration, /2026-820|268105|90562e4b/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(projects|quotations|crm_reservations)/i);
});
