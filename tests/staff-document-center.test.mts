import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isCanonicalMonth,
  safeStaffDocumentFileName,
  staffDocumentStoragePath,
} from "../features/staff-documents/staff-document-model.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/0160_staff_document_center.sql", import.meta.url),
  "utf8",
);
const protectedRoute = readFileSync(
  new URL(
    "../app/api/staff-documents/[staffId]/[documentId]/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const uploadRoute = readFileSync(
  new URL(
    "../app/api/staff-documents/[staffId]/upload/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const staffPage = readFileSync(
  new URL("../app/(platform)/resources/staff/page.tsx", import.meta.url),
  "utf8",
);
const center = readFileSync(
  new URL(
    "../features/staff-documents/staff-document-center.tsx",
    import.meta.url,
  ),
  "utf8",
);
const model = readFileSync(
  new URL(
    "../features/staff-documents/staff-document-model.ts",
    import.meta.url,
  ),
  "utf8",
);

test("Staff document paths are Staff-ID namespaced and filename-safe", () => {
  const path = staffDocumentStoragePath({
    staffId: "staff-123",
    category: "BOLETAS",
    applicableMonth: "2026-08",
    documentId: "document-456",
    fileName: "Boleta José / agosto.PDF",
  });
  assert.equal(
    path,
    "staff/staff-123/03_BOLETAS/2026-08/document-456-Boleta-Jose-agosto.pdf",
  );
  assert.equal(safeStaffDocumentFileName("../../cédula frente.png"), "cedula-frente.png");
  assert.equal(isCanonicalMonth("2026-08"), true);
  assert.equal(isCanonicalMonth("2026-8"), false);
});

test("Periodic Staff documents reject missing or malformed YYYY-MM", () => {
  assert.throws(() =>
    staffDocumentStoragePath({
      staffId: "staff-123",
      category: "LIQUIDACIONES",
      documentId: "document-456",
      fileName: "liquidacion.pdf",
    }),
  );
});

test("Migration classifies existing onboarding files without moving Storage objects", () => {
  assert.match(migration, /update public\.staff_onboarding_documents[\s\S]*category='IDENTIDAD'/);
  assert.match(migration, /where document_type in\([\s\S]*'IDENTITY_FRONT'/);
  assert.doesNotMatch(migration, /storage\.objects\s+set|storage\.objects\s+delete/i);
  assert.match(migration, /where staff_id is not null/);
});

test("Protected API enforces administrator role and exact Staff ownership", () => {
  assert.match(protectedRoute, /requireStaffDocumentAdministrator/);
  assert.match(protectedRoute, /\.eq\("id", documentId\)[\s\S]*\.eq\("staff_id", staffId\)/);
  assert.match(protectedRoute, /staff_expense_submissions[\s\S]*\.eq\("staff_id", staffId\)[\s\S]*\.eq\("document_id", documentId\)/);
  assert.match(protectedRoute, /Cache-Control": "private, no-store/);
  assert.doesNotMatch(protectedRoute, /createSignedUrl/);
});

test("New uploads remain private and use the canonical orbit-documents bucket", () => {
  assert.match(uploadRoute, /staffDocumentStoragePath/);
  assert.match(uploadRoute, /\.from\("orbit-documents"\)/);
  assert.match(uploadRoute, /staff_onboarding_documents/);
  assert.match(uploadRoute, /created_by: authorization\.userId/);
  assert.doesNotMatch(uploadRoute, /getPublicUrl|publicURL|publicUrl/);
});

test("Founder profile projects onboarding and canonical expense documents once", () => {
  assert.match(staffPage, /from\("staff_onboarding_documents"\)/);
  assert.match(staffPage, /source: "STAFF_DOCUMENT"/);
  assert.match(staffPage, /source: "EXPENSE_REFERENCE"/);
  assert.match(staffPage, /documents: \[\.\.\.canonicalDocuments, \.\.\.expenseReferences\]/);
});

test("Document Center exposes all six categories and protected actions", () => {
  for (const label of [
    "Identidad",
    "Contratos",
    "Boletas",
    "Gastos",
    "Liquidaciones",
    "Otros",
  ])
    assert.match(model, new RegExp(label));
  assert.match(center, /\/api\/staff-documents\/\$\{staffId\}\/\$\{document\.id\}/);
  assert.match(center, /break-all/);
  assert.match(center, /flex-wrap/);
});
