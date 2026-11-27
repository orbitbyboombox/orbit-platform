import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

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
const documentHub = source("features/external-tax-documents/event-commercial-document-hub.tsx");

test("eligible Classic Event requires the Photo Strip Design section", () => {
  assert.equal(requiresPhotoStripDesign(["CLASSIC"]), true);
  assert.equal(requiresPhotoStripDesign(["BLACK_STUDIO"]), true);
  assert.match(founderUi, /DISEÑO \/ IMPRESIÓN/);
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
  assert.match(documentHub, /PHOTO_STRIP_DESIGN:"Diseño tira de fotos"/);
});

test("Drive archive uses the canonical Event design folder", () => {
  assert.match(service, /kind: "DESIGN"/);
  assert.match(founderUi, /04_Diseños/);
  assert.equal(photoStripDriveFileName({ orbitEventId: "2026-826", version: 2, originalFilename: "Tira final.png" }), "TIRA_FOTOS_V2_2026-826_Tira-final.png");
});

test("Drive retries are idempotent", () => {
  const driveRouting = source("features/connectors/google-drive/application/google-drive-document-routing.service.ts");
  assert.match(driveRouting, /findFilesByName/);
  assert.match(driveRouting, /existing\.length > 1 \|\| existing\.some\(file => file\.md5Checksum !== md5\)/);
  assert.match(driveRouting, /existing\[0\] \?\? await input\.provider\.uploadFile/);
  assert.match(driveRouting, /reused: existing\.length === 1/);
  assert.match(actions, /retryPhotoStripDriveAction/);
  assert.match(founderUi, /current && current\.driveStatus !== "SYNCED"/);
});

test("Drive failure cannot erase or invalidate the canonical design", () => {
  assert.match(actions, /El diseño quedó protegido en ORBIT y visible en el Portal/);
  assert.match(actions, /recordPhotoStripDriveFailure/);
  assert.match(service, /drive_sync_status: "ERROR"/);
});

function loadGet<Params>(route: string, dependencies: Record<string, unknown>) {
  const exports = {} as { GET: (request: Request, context: { params: Promise<Params> }) => Promise<Response> };
  class NextResponse extends Response {}
  const { outputText } = ts.transpileModule(route, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  new Function("require", "exports", outputText)((name: string) => {
    if (name === "next/server") return { NextResponse };
    assert.ok(name in dependencies, `Unexpected route dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports.GET;
}

test("Founder document history is restricted to Founder and Administration", async () => {
  for (const role of ["CEO", "ADMINISTRATOR", "SALES", "OPERATIONS", "READONLY", "STAFF", "CUSTOMER"]) {
    for (const type of ["PHOTO_STRIP_DESIGN", "STAFF_EXPENSE_RECEIPT"]) {
      let downloads = 0;
      const client = {
        auth: { getUser: async () => ({ data: { user: { id: "actor" } } }) },
        from(table: string) {
          return {
            select() { return this; },
            eq() { return this; },
            is() { return this; },
            async single() {
              return { data: table === "profiles" ? { role } : { document_type: type, storage_path: "test.pdf" } };
            },
          };
        },
        storage: { from: () => ({ download: async () => {
          downloads++;
          return { data: new Blob(["sample"]) };
        } }) },
      };
      const get = loadGet<{ projectId: string; documentId: string }>(founderRoute, {
        "@/lib/supabase/server": { createSupabaseServerClient: async () => client },
      });
      const response = await get(new Request("https://example.invalid"), {
        params: Promise.resolve({ projectId: "event", documentId: "design" }),
      });
      const allowed = role === "CEO" || role === "ADMINISTRATOR";
      assert.equal(response.status, allowed ? 200 : 403, `${role} / ${type}`);
      assert.equal(downloads, allowed ? 1 : 0);
      if (allowed) assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    }
  }
  assert.match(migration, /public\.can_administer\(\)/);
});

test("each customer's portal token opens only the current design of its own event", async () => {
  for (const owner of ["a", "b"]) {
    let queriedProject: unknown;
    let downloads = 0;
    const get = loadGet<{ token: string; documentId: string }>(portalRoute, {
      "@/features/customer-portal/customer-portal.service": {
        loadCustomerPortal: async (token: string) => ({
          access: { project_id: token },
          documents: [{ id: `design-${token}`, document_type: "PHOTO_STRIP_DESIGN" }],
        }),
      },
      "@/lib/supabase/admin": { createAdminClient: () => ({
        from() {
          return {
            select() { return this; },
            eq(key: string, value: unknown) {
              if (key === "project_id") queriedProject = value;
              return this;
            },
            is() { return this; },
            async single() {
              return { data: { is_current: true, storage_bucket: "private", storage_path: "test.pdf" } };
            },
          };
        },
        storage: { from: () => ({ download: async () => {
          downloads++;
          return { data: new Blob(["sample"]) };
        } }) },
      }) },
    });
    const request = new Request("https://example.invalid");
    const other = owner === "a" ? "b" : "a";
    const denied = await get(request, { params: Promise.resolve({ token: owner, documentId: `design-${other}` }) });
    assert.equal(denied.status, 404);
    assert.equal(downloads, 0);
    const allowed = await get(request, { params: Promise.resolve({ token: owner, documentId: `design-${owner}` }) });
    assert.equal(allowed.status, 200);
    assert.equal(queriedProject, owner);
    assert.equal(downloads, 1);
    assert.match(allowed.headers.get("Cache-Control") ?? "", /private, no-store/);
  }
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
