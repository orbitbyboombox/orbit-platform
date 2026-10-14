import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const actions = source("features/event-designs/actions.ts");
const center = source("features/event-designs/event-design-center.tsx");
const workspace = source("features/projects/components/project-workspace-experience.tsx");
const documentRoute = source("app/api/projects/[projectId]/documents/[documentId]/route.ts");

test("every event receives the generic design center independently of service codes", () => {
  assert.match(workspace, /EventDesignCenter/);
  assert.match(workspace, /document\.type === "DESIGN"/);
  assert.match(center, /DISEÑOS DEL EVENTO/);
  assert.doesNotMatch(workspace, /shouldShowPhotoStripDesignCenter\(event\.services/);
});

test("generic designs use DESIGN and preserve version history", () => {
  assert.match(actions, /document_type: EVENT_DESIGN_TYPE/);
  assert.match(actions, /is_current: false/);
  assert.match(actions, /event-design\|\$\{projectId\}\|\$\{checksum\}/);
  assert.match(center, /Ver historial/);
  assert.match(center, /SUPERSEDED|SUPERSEDIDA/);
});

test("generic uploads support common client artwork formats and mobile file selection", () => {
  assert.match(actions, /image\/webp/);
  assert.match(actions, /application\/pdf/);
  assert.match(center, /type="file"/);
  assert.match(center, /variant="fullscreen-mobile"/);
  assert.match(center, /max-w-full/);
});

test("generic actions are Founder/Admin-only and do not touch financial tables", () => {
  assert.match(actions, /\["CEO", "ADMINISTRATOR"\]/);
  assert.match(actions, /Solo Founder o Administración/);
  assert.doesNotMatch(actions, /invoice_payments|receivable_movements|settlements|payments/);
  assert.match(documentRoute, /document\.document_type === "PHOTO_STRIP_DESIGN"/);
});

test("Drive archive is canonical, idempotent, and failure leaves the ORBIT document available", () => {
  assert.match(actions, /archiveReservationDocumentToDrive/);
  assert.match(actions, /kind: "DESIGN"/);
  assert.match(actions, /drive_sync_status: "ERROR"/);
  assert.match(actions, /El diseño quedó protegido en ORBIT/);
});

test("current generic design can be viewed and downloaded without replacing legacy photo-strip history", () => {
  assert.match(center, /Ver diseño/);
  assert.match(center, /Descargar/);
  assert.match(workspace, /PhotoStripDesignCenter/);
  assert.match(workspace, /photoStripDocuments/);
});
