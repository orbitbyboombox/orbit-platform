import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync("features/portal-authentication/staff-portal.actions.ts", "utf8");
const dashboard = readFileSync("features/portal-authentication/staff-portal-dashboard.tsx", "utf8");
const boxPanel = readFileSync("features/portal-authentication/staff-box-operations-panel.tsx", "utf8");

test("operator phase persists checklist items and scopes incident reports", () => {
  for (const code of ["PAPER_LOADED", "PAPER_FORMAT_MATCH", "PRINTER_RECOGNIZES_PAPER", "PAPER_NO_DAMAGE", "EQUIPMENT_POWER", "CAMERA_OPERATIONAL", "PRINTER_OPERATIONAL", "SCREEN_OPERATIONAL", "FLASH_OPERATIONAL", "CABLES_PRESENT"]) assert.match(actions, new RegExp(code));
  assert.match(actions, /assignment_type.*OPERATOR/);
  assert.match(actions, /from\("event_incidents"\)/);
  assert.match(actions, /from\("internal_notifications"\)/);
  assert.match(actions, /portal_session_id/);
});

test("operator view exposes required operational checks and alert form", () => {
  for (const label of ["Checklist de papel", "Checklist de equipo", "Papel cargado correctamente", "Cámara operativa", "Reportar problema", "CON INCIDENCIA", "alerta visible para Administración"]) assert.match(dashboard, new RegExp(label));
  assert.match(dashboard, /event\.roles\.includes\("OPERATOR"\)/);
  assert.match(dashboard, /reportStaffOperatorIncidentAction/);
});

test("operator box view reads the immutable opening snapshot without final closeout controls", () => {
  assert.match(boxPanel, /readOnlyPaperCloseout/);
  assert.match(boxPanel, /Snapshot de papel · apertura/);
  assert.match(boxPanel, /paper\.openingBalance/);
  assert.match(boxPanel, /stock final se registra en la fase de cierre/);
});
