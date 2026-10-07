import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const view = readFileSync("features/resources/staff-logistics-view.tsx", "utf8");
const page = readFileSync("app/(platform)/resources/staff/page.tsx", "utf8");
const action = readFileSync("features/asset-management/event-black-box.actions.ts", "utf8");

test("Logistics quick assignment uses the canonical event Caja Negra action", () => {
  assert.match(view, /assignBlackBoxToEventAction/);
  assert.match(view, /Asignación rápida desde Logística/);
  assert.match(view, /QuickBoxAssignment/);
  assert.match(view, /FALTA CAJA · ASIGNAR/);
  assert.match(view, /CAMBIAR/);
  assert.match(view, /boxStatusLabel/);
  assert.match(view, /option\.status === "MAINTENANCE" \|\| option\.status === "OUT_OF_SERVICE"/);
  assert.match(action, /rpc\("assign_black_box_to_event"/);
  assert.match(action, /revalidatePath\("\/resources\/staff"\)/);
});

test("Logistics exposes only the nine operational CASE assets and route rows read event.box", () => {
  assert.match(page, /\.eq\("asset_type", "CASE"\)/);
  assert.match(page, /Array\.from\(\{ length: 9 \}/);
  assert.match(page, /CASE-\$\{String\(index \+ 1\)\.padStart\(2, "0"\)\}/);
  assert.match(page, /boxOptions=\{logisticsBoxOptions\}/);
  assert.match(view, /event\.box === "Sin asignar" \? "⚠ FALTA CAJA" : event\.box/);
  assert.doesNotMatch(page, /route_box_assignment|logistics_box_assignment/);
});

test("The Caja Negra popover exposes the full operational inventory without parent clipping", () => {
  assert.match(view, /max-h-64 w-48 overflow-y-auto overscroll-contain/);
  assert.match(view, /overflow-visible rounded-2xl/);
  assert.match(page, /Array\.from\(\{ length: 9 \}/);
  assert.match(page, /CASE-\$\{String\(index \+ 1\)\.padStart/);
  assert.match(view, /const disabled = !isCurrent && \(unavailable \|\| conflictsThisEvent\)/);
  assert.match(view, /conflictingProjectIds\?\.includes\(event\.projectId\)/);
  assert.match(view, /OCUPADA \/ SIN MARGEN SUFICIENTE/);
  assert.doesNotMatch(view, /!isCurrent && option\.status !== "AVAILABLE"/);
  assert.match(view, /ASIGNADA/);
  assert.doesNotMatch(page, /CASE-10|CASE-11|CASE-12/);
});

test("Caja Negra action preserves committed success and exposes real RPC errors", () => {
  assert.match(action, /const errorMessage = \(error: unknown, fallback: string\)/);
  assert.match(action, /typeof error\.message === "string"/);
  assert.match(action, /if \(!data \|\| typeof data !== "object" \|\| !\("assignmentId" in data\)\)/);
  assert.match(action, /assignment committed but revalidation failed/);
  assert.match(action, /return \{ ok: true \};/);
});

test("Event detail provides the canonical box assignment UX and preserves paper semantics", () => {
  const panel = readFileSync("features/asset-management/event-black-box-panel.tsx", "utf8");
  const action = readFileSync("features/asset-management/event-black-box.actions.ts", "utf8");
  assert.match(panel, /CAJA ASIGNADA/);
  assert.match(panel, /PAPEL DISPONIBLE/);
  assert.match(panel, /ASIGNAR CAJA AL EVENTO/);
  assert.match(panel, /CONFIRMAR ASIGNACIÓN/);
  assert.match(panel, /Papel disponible:/);
  assert.match(panel, /Cambiar Caja/);
  assert.match(panel, /Liberar Caja/);
  assert.match(panel, /blackBoxPhotoStock/);
  assert.match(action, /event_paper_snapshots/);
  assert.match(action, /assign_black_box_to_event/);
  assert.doesNotMatch(panel, /localStorage/);
});

test("availability uses the canonical two-hour logistics buffer", () => {
  const migration = readFileSync("supabase/migrations/20260927183000_black_box_logistics_buffer.sql", "utf8");
  assert.match(migration, /interval '2 hours'/g);
  assert.match(migration, /get_black_box_availability/);
  assert.match(migration, /aa\.planned_start_at < window_row\.window_end \+ interval '2 hours'/);
  assert.match(migration, /aa\.planned_end_at \+ interval '2 hours' > window_row\.window_start/);
  assert.match(migration, /p_project_ids uuid\[\]/);
  assert.doesNotMatch(migration, /asset_row\.status='ASSIGNED'/);
});
