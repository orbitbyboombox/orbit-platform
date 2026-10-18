import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portal = readFileSync("features/portal-authentication/staff-portal.tsx", "utf8");
const dashboard = readFileSync("features/portal-authentication/staff-portal-dashboard.tsx", "utf8");
const page = readFileSync("app/(platform)/projects/[projectId]/page.tsx", "utf8");
const workspace = readFileSync("features/projects/components/project-workspace-experience.tsx", "utf8");

test("Staff portal reads canonical settlement adjustments without reusing transport_bonus", () => {
  assert.match(portal, /event_staff_settlement_adjustments/);
  assert.match(portal, /adjustmentsBySettlement/);
  assert.doesNotMatch(portal, /transport_bonus/);
  assert.match(dashboard, /Adicionales/);
});

test("event ficha renders the canonical print closeout fields", () => {
  assert.match(page, /event_paper_snapshots/);
  assert.match(page, /box_asset_id,printer_asset_id/);
  assert.match(workspace, /CONTROL DE IMPRESIONES/);
  assert.match(workspace, /Impresiones realizadas/);
  assert.match(workspace, /Papel restante al finalizar/);
  assert.match(workspace, /no recalcula ni descuenta inventario/);
});

test("print control does not silently convert an open snapshot into a completed closeout", () => {
  assert.match(workspace, /confirmed && control\.impressions !== null/);
  assert.match(workspace, /Pendiente de cierre/);
});
