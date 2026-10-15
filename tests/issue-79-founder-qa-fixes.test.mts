import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("Issue 79 compacts every Documents submodule instead of rendering one endless stack", () => {
  const workspace = read("features/projects/components/project-workspace-experience.tsx");
  const hub = read("features/external-tax-documents/event-commercial-document-hub.tsx");
  const designs = read("features/event-designs/event-design-center.tsx");
  const photoStrip = read("features/photo-strip-design/photo-strip-design-center.tsx");

  assert.match(workspace, /data-issue75-documents-grid/);
  assert.match(hub, /data-issue79-documents-compact/);
  assert.match(hub, /<details/);
  assert.match(hub, /DocumentRows/);
  assert.match(designs, /Ver historial/);
  assert.match(photoStrip, /Ver historial/);
  assert.doesNotMatch(hub, /break-all[^\n]*DESTINATARIO/);
});

test("Issue 79 quick Staff payment exposes only positive canonical event balances", () => {
  const page = read("app/(platform)/resources/staff/page.tsx");
  const center = read("features/staff-payments/staff-payments-center.tsx");
  const action = read("features/staff-monthly-account/actions.ts");

  assert.match(page, /paymentEventsByObligation/);
  assert.match(page, /item\.staffId}:\$\{item\.projectId/);
  assert.match(center, /data-issue79-quick-obligations/);
  assert.match(center, /event\.honorariaOutstanding/);
  assert.match(center, /exactMonthlyMatch/);
  assert.match(center, /Revisión canónica pendiente/);
  assert.match(center, /OK \/ PAGAR Y REGISTRAR COMPROBANTE/);
  assert.match(action, /pago rápido no coincide con una única obligación canónica pendiente/);
  assert.match(action, /current\.payment_status !== "READY_TO_PAY"/);
});

test("Issue 79 keeps paper inventory read-only and distinguishes missing physical stock from zero", () => {
  const warehouse = read("features/resources/warehouse-inventory.tsx");
  const boxes = read("features/resources/black-box-master.tsx");

  assert.match(warehouse, /data-issue79-paper-inventory/);
  assert.match(warehouse, /rollos de 700/);
  assert.match(warehouse, /No se interpreta una fuente física ausente como cero/);
  assert.match(warehouse, /Transferencia aún no habilitada/);
  assert.match(warehouse, /disabled/);
  assert.match(boxes, /Papel físico en Caja/);
  assert.match(boxes, /No existe lote de papel cargado/);
  assert.doesNotMatch(warehouse, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});
