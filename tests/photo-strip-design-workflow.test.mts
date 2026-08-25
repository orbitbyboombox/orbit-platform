import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { requiresPhotoStripDesign } from "../features/business-core/catalog/service.catalog.ts";
import { photoStripDriveFileName } from "../features/photo-strip-design/model.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = source("supabase/migrations/0175_photo_strip_design_workflow.sql");
const actions = source("features/photo-strip-design/actions.ts");
const service = source("features/photo-strip-design/photo-strip-design.service.ts");
const founderUi = source("features/photo-strip-design/photo-strip-design-center.tsx");
const portalUi = source("features/customer-portal/customer-photo-strip-design-experience.tsx");
const portalService = source("features/customer-portal/customer-portal.service.ts");
const portalRoute = source("app/api/portal/[token]/design/[documentId]/route.ts");
const founderRoute = source("app/api/projects/[projectId]/documents/[documentId]/route.ts");

test("eligible Classic Event requires the Photo Strip Design section", () => {
  assert.equal(requiresPhotoStripDesign(["CLASSIC"]), true);
  assert.match(founderUi, /DISEÑO TIRA DE FOTOS/);
});

test("unrelated services do not inherit the requirement", () => {
  assert.equal(requiresPhotoStripDesign(["BBOX360"]), false);
  assert.equal(requiresPhotoStripDesign(["LIGHTBOX", "VIDEO_LOUNGE"]), false);
});

test("Founder upload persists first in protected canonical storage", () => {
  assert.match(actions, /storage\.from\("orbit-documents"\)\.upload/);
  assert.match(actions, /register_photo_strip_design/);
  assert.match(actions, /PDF, JPG, JPEG o PNG de hasta 20 MB/);
});

test("reload persistence comes from the documents table", () => {
  assert.match(portalService, /from\("documents"\)/);
  assert.match(migration, /insert into public\.documents/);
});

test("Portal exposes only the current Photo Strip Design", () => {
  assert.match(portalService, /document_type\.neq\.PHOTO_STRIP_DESIGN,is_current\.eq\.true/);
  assert.match(portalUi, /document\.document_type === "PHOTO_STRIP_DESIGN" && document\.is_current/);
});

test("Portal document access is bound to the token Event", () => {
  assert.match(portalRoute, /\.eq\("project_id",portal\.access\.project_id\)/);
  assert.match(portalRoute, /PHOTO_STRIP_DESIGN"&&!document\.is_current/);
});

test("Founder approval targets the current canonical version", () => {
  assert.match(migration, /create or replace function public\.approve_photo_strip_design/);
  assert.match(migration, /and is_current/);
  assert.match(migration, /workflow_status='APPROVED'/);
});

test("a new version supersedes approval and starts RECEIVED", () => {
  assert.match(migration, /set is_current=false/);
  assert.match(migration, /'RECEIVED','PENDING'/);
});

test("previous versions remain in Founder history", () => {
  assert.match(founderUi, /Historial del diseño/);
  assert.match(founderUi, /SUPERSEDIDA/);
  assert.doesNotMatch(migration, /delete from public\.documents/i);
});

test("Drive archive uses the canonical Event design folder", () => {
  assert.match(service, /kind: "DESIGN"/);
  assert.match(founderUi, /04_Diseños/);
  assert.equal(photoStripDriveFileName({ orbitEventId: "2026-826", version: 2, originalFilename: "Tira final.png" }), "TIRA_FOTOS_V2_2026-826_Tira-final.png");
});

test("Drive retries are idempotent", () => {
  const driveRouting = source("features/connectors/google-drive/application/google-drive-document-routing.service.ts");
  assert.match(driveRouting, /findFileByName/);
  assert.match(driveRouting, /reused: Boolean\(existing\)/);
  assert.match(actions, /retryPhotoStripDriveAction/);
  assert.match(founderUi, /current && current\.driveStatus !== "SYNCED"/);
});

test("Drive failure cannot erase or invalidate the canonical design", () => {
  assert.match(actions, /El diseño quedó protegido en ORBIT y visible en el Portal/);
  assert.match(actions, /recordPhotoStripDriveFailure/);
  assert.match(service, /drive_sync_status: "ERROR"/);
});

test("Founder document history is restricted to Founder and Administration", () => {
  assert.match(founderRoute, /document\.document_type === "PHOTO_STRIP_DESIGN"/);
  assert.match(founderRoute, /\["CEO", "ADMINISTRATOR"\]/);
  assert.match(migration, /public\.can_administer\(\)/);
});

test("Founder UI uses the certified mobile dialog and avoids horizontal overflow", () => {
  assert.match(founderUi, /MobileDialog/);
  assert.match(founderUi, /variant="fullscreen-mobile"/);
  assert.match(founderUi, /min-w-0 max-w-full/);
});

test("Portal design card is mobile-safe and has view and download actions", () => {
  assert.match(portalUi, /grid grid-cols-2 gap-2 sm:flex/);
  assert.match(portalUi, /Ver diseño/);
  assert.match(portalUi, /Descargar/);
});

test("migration is additive and does not backfill fake artwork or touch payments", () => {
  assert.match(migration, /alter table public\.documents/);
  assert.doesNotMatch(migration, /backfill|historical import|seed photo/i);
  assert.doesNotMatch(migration, /invoice_payments|payment_ledger|paid_amount/i);
  assert.doesNotMatch(actions, /send.*mail|communication/i);
});
