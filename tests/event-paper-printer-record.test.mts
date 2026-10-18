import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("manual printer attribution is additive, append-only, and isolated from paper inventory", async () => {
  const migration = await source("supabase/migrations/20261018120000_event_paper_printer_records.sql");
  const action = await source("features/projects/event-paper.actions.ts");
  const page = await source("app/(platform)/projects/[projectId]/page.tsx");
  const workspace = await source("features/projects/components/project-workspace-experience.tsx");

  assert.match(migration, /event_paper_printer_records/);
  assert.match(migration, /idempotency_key text not null unique/);
  assert.match(migration, /before update or delete/);
  assert.doesNotMatch(migration, /update public\.event_paper_snapshots/);
  assert.doesNotMatch(action, /update\(\{[^}]*printer_asset_id/);
  assert.match(action, /saveEventPaperPrinterRecordAction/);
  assert.match(page, /event_paper_printer_records/);
  assert.match(workspace, /Identificación manual de impresora/);
  assert.match(workspace, /GUARDAR IMPRESORA/);
  assert.match(workspace, /El cierre de papel y el inventario no fueron modificados/);
});

test("printer records keep the canonical case and paper closeout read-only", async () => {
  const workspace = await source("features/projects/components/project-workspace-experience.tsx");
  assert.match(workspace, /Caja utilizada/);
  assert.match(workspace, /Lectura del cierre de papel registrado; no recalcula ni descuenta inventario/);
  assert.match(workspace, /printerPersistenceAvailable/);
});
