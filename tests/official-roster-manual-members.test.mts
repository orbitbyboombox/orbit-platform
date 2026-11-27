import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const roster = readFileSync("features/staff-roster/official-staff-roster.ts", "utf8");
const actions = readFileSync("features/staff-roster/official-staff-roster.actions.ts", "utf8");
const control = readFileSync("features/staff-roster/official-staff-roster-control.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261128090000_event_manual_roster_members.sql", "utf8");
const classificationMigration = readFileSync("supabase/migrations/20261127210000_manual_roster_unpaid_support.sql", "utf8");

test("los integrantes manuales quedan separados de asignaciones y finanzas", () => {
  assert.match(migration, /create table if not exists public\.event_manual_roster_members/);
  assert.match(roster, /event_manual_roster_members/);
  assert.match(control, /No crea asignaciones, honorarios, boletas, pagos, gastos ni liquidaciones/);
  assert.match(roster, /payroll_classification: "UNPAID_SUPPORT"/);
  assert.match(classificationMigration, /payroll_classification = 'UNPAID_SUPPORT'/);
  assert.match(classificationMigration, /where deleted_at is null/);
  assert.doesNotMatch(roster, /assignments.*insert|insert.*assignments/);
});

test("el mantenimiento manual exige permisos administrativos y conserva soft delete", () => {
  assert.match(actions, /isAdministrativeRole\(profile\.role\)/);
  assert.match(roster, /deleted_at: new Date\(\)\.toISOString\(\)/);
  assert.match(roster, /createManualRosterMember/);
  assert.match(roster, /updateManualRosterMember/);
  assert.match(roster, /deleteManualRosterMember/);
});

test("la nómina presenta Staff y apoyo en una tabla única sin sección manual", () => {
  assert.match(roster, /NÓMINA DEL EVENTO/);
  assert.match(roster, /for \(const member of composer\.manualMembers\)/);
  assert.match(roster, /"FUNCIÓN"/);
  assert.doesNotMatch(roster, /INTEGRANTES MANUALES|manualGroups/);
  assert.match(roster, /assertManualMemberIsNotAssigned/);
  assert.match(classificationMigration, /event_manual_roster_members_active_uq/);
  assert.doesNotMatch(classificationMigration, /delete from public\.event_manual_roster_members/i);
  assert.match(roster, /OFFICIAL_STAFF_ROSTER_V3/);
  assert.match(roster, /payrollClassification: "UNPAID_SUPPORT"/);
  assert.match(roster, /app\.bbox\.cl\/branding\/boombox-logo-official-white-email\.png/);
  assert.match(roster, /readOfficialRosterLogo/);
});

test("el correo conserva el adjunto premium y no crea una sección separada para apoyo manual", () => {
  const sendSection = roster.slice(roster.indexOf("export async function sendOfficialRoster"));
  assert.match(sendSection, /attachments:\[\{filename,mimeType:"application\/pdf",content:bytes\}\]/);
  assert.doesNotMatch(sendSection, /INTEGRANTES MANUALES/);
});
