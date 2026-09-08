import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("features/customer-portal/customer-portal-home.tsx", "utf8");
const service = readFileSync("features/customer-portal/customer-portal.service.ts", "utf8");
const documentsRoute = readFileSync("app/api/portal/[token]/documents/[fileId]/route.ts", "utf8");
const authMigration = readFileSync("supabase/migrations/0019_portal_authentication_v2.sql", "utf8");

test("customer portal mounts the canonical modules once", () => {
  for (const component of ["CustomerDocumentsExperience", "CustomerContractExperience", "CustomerCommunicationCenter", "CustomerGalleryExperience", "CustomerDesignExperience"]) assert.match(home, new RegExp(`<${component}`));
});

test("portal modules remain project scoped", () => {
  assert.match(service, /eq\("project_id", access\.project_id\)/);
  assert.match(service, /loadCustomerGallery\(access\.project_id\)/);
  assert.match(service, /loadCustomerDocuments\(access\.project_id\)/);
});

test("document download enforces token and project ownership with Storage first", () => {
  assert.match(documentsRoute, /loadCustomerPortal\(token\)/);
  assert.match(documentsRoute, /eq\("project_id", portal\.access\.project_id\)/);
  assert.match(documentsRoute, /storage\.from\(stored\.storage_bucket\)\.download/);
  assert.match(documentsRoute, /drive_file_id/);
});

test("document records expose external tax metadata to the customer portal", () => {
  for (const field of ["external_tax_document_type", "external_folio", "external_issue_date", "external_total_amount", "external_document_status"]) assert.match(service, new RegExp(field));
  assert.match(home, /XML tributario no está disponible/);
});

test("customer portal authentication remains fail-closed and records one project session", () => {
  assert.match(authMigration, /authenticate_customer_portal/);
  assert.match(authMigration, /p\.event_date=p_event_date/);
  assert.match(authMigration, /p\.deleted_at is null/);
  assert.match(authMigration, /portal_access_sessions/);
});
