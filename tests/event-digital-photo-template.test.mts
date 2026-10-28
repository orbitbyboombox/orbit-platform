import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { eventDigitalPhotoTemplateDriveFileName } from "../features/event-digital-photo-template/model.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const actions = source("features/event-digital-photo-template/actions.ts");
const center = source("features/event-digital-photo-template/center.tsx");
const service = source("features/event-digital-photo-template/service.ts");
const migration = source("supabase/migrations/20261028160000_event_digital_photo_template.sql");
const workspace = source("features/projects/components/project-workspace-experience.tsx");
const staffPortal = source("features/portal-authentication/staff-portal.tsx");
const staffDashboard = source("features/portal-authentication/staff-portal-dashboard.tsx");

test("accepts the three supported formats and rejects unsafe uploads before storage", () => {
  assert.match(actions, /application\/pdf/);
  assert.match(actions, /image\/jpeg/);
  assert.match(actions, /image\/png/);
  assert.match(actions, /20 \* 1024 \* 1024/);
  assert.match(actions, /upsert: false/);
});

test("uses an independent document type and preserves version history atomically", () => {
  assert.match(migration, /EVENT_DIGITAL_PHOTO_TEMPLATE/g);
  assert.match(migration, /is_current=false/);
  assert.match(migration, /operational_for_staff/);
  assert.match(migration, /p_idempotency_key/);
  assert.doesNotMatch(actions, /PHOTO_STRIP_DESIGN/);
  assert.doesNotMatch(service, /PHOTO_STRIP_DESIGN/);
});

test("Drive archive is deterministic, idempotent, and targets the design folder strategy", () => {
  assert.equal(eventDigitalPhotoTemplateDriveFileName({ orbitEventId: "ORB-2026-42", version: 2, originalFilename: "Marco final.png" }), "TEMPLATE_DIGITAL_V2_ORB-2026-42_Marco-final.png");
  assert.match(service, /archiveReservationDocumentToDrive/);
  assert.match(actions, /recordEventDigitalPhotoTemplateDriveFailure/);
  assert.match(center, /Reintentar Drive/);
  assert.match(center, /04_Diseños/);
});

test("Event Operation exposes the template independently and Staff remains read-only", () => {
  assert.match(workspace, /EventDigitalPhotoTemplateCenter/);
  assert.match(workspace, /EVENT_DIGITAL_PHOTO_TEMPLATE/);
  assert.match(center, /Nueva versión/);
  assert.match(staffPortal, /operational_for_staff/);
  assert.match(staffDashboard, /api\/staff-portal\/documents/);
  assert.doesNotMatch(staffPortal, /upload.*document|documents.*upload/i);
  assert.doesNotMatch(staffDashboard, /upload.*document|documents.*upload/i);
});
