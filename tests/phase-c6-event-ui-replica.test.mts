import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase C.6 keeps the PDF event language in admin and Staff surfaces", () => {
  const admin = read("features/projects/components/event-ui-replica.tsx");
  const list = read("features/crm/event-center.tsx");
  const staff = read("features/portal-authentication/staff-portal-dashboard.tsx");
  for (const marker of ["Caja Negra", "CHECK-OUT", "CHECK-IN", "COBRAR CLIENTE", "bg-[#111214]", "bg-brand"]) assert.match(admin, new RegExp(marker.replace(/[\[\]#]/g, "\\$&")));
  assert.match(list, /Nuevo evento/);
  assert.match(list, /bg-\[#191a1d\]/);
  assert.match(staff, /initialEventId/);
  assert.match(staff, /HORARIO CONFIRMADO/);
  assert.doesNotMatch(staff, /<Small label="Pago neto"/);
  assert.doesNotMatch(admin, /Fórmula C\.5/);
  assert.match(admin, /divide-y divide-white\/10/);
  assert.match(admin, /VER EQUIPAMIENTO/);
});

test("Phase C.5 remains wired to the paper ledger and closeout guard", () => {
  const migration = read("supabase/migrations/20260926004605_phase_c5_event_paper_consumption.sql");
  const panel = read("features/portal-authentication/staff-box-operations-panel.tsx");
  assert.match(migration, /event_paper_snapshots/);
  assert.match(migration, /from public\.projects p\s+where p\.id=new\.project_id/);
  assert.match(migration, /EVENT_USAGE/);
  assert.match(migration, /Falta registrar el papel restante/);
  assert.match(panel, /Falta registrar el papel restante/);
  assert.match(panel, /confirmStaffPaperCloseoutAction/);
});

test("Phase C.5 reminder uses the canonical worker and is idempotent", () => {
  const cron = read("app/api/cron/staff-assignment-reminders/route.ts");
  assert.match(cron, /event_paper_snapshots/);
  assert.match(cron, /PAPER_CLOSEOUT_MINUS_5/);
  assert.match(cron, /staff-paper-closeout:/);
  assert.match(cron, /INGRESAR PAPEL RESTANTE/);
  assert.match(cron, /onConflict: "correlation_id"/);
  assert.match(cron, /assignment_type\", \"OPERATOR\"/);
});

test("C.6 paper variant is event metadata and never reinterprets inventory format_key", () => {
  const migration = read("supabase/migrations/20260926130000_phase_c6_event_paper_variant.sql");
  const admin = read("features/projects/components/event-ui-replica.tsx");
  const staff = read("features/portal-authentication/staff-box-operations-panel.tsx");
  assert.match(migration, /paper_variant text/);
  assert.match(migration, /NORMAL_4X6.*PRECUT_4X6/);
  assert.match(migration, /old\.status in \('CONFIRMED','OVERRIDDEN'\)/);
  assert.match(migration, /old\.format_key is distinct from new\.format_key/);
  assert.match(admin, /4x6 NORMAL/);
  assert.match(admin, /4x6 PREPICADO/);
  assert.match(migration, /format_key/);
  assert.match(staff, /paper\.variant/);
});
