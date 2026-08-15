import assert from "node:assert/strict";
import test from "node:test";
import { globalSearchHref, normalizeGlobalSearchTerm } from "../../features/global-search/model.ts";

test("normalizes exact, partial and case-insensitive customer names", () => {
  assert.equal(normalizeGlobalSearchTerm("Soledad Provens"), "soledadprovens");
  assert.ok(normalizeGlobalSearchTerm("Soledad Provens").includes(normalizeGlobalSearchTerm("Sole")));
  assert.equal(normalizeGlobalSearchTerm("SOLEDAD"), normalizeGlobalSearchTerm("soledad"));
});

test("normalizes accents in both directions", () => {
  assert.equal(normalizeGlobalSearchTerm("José"), normalizeGlobalSearchTerm("Jose"));
});

test("normalizes Chilean RUT and phone punctuation", () => {
  assert.equal(normalizeGlobalSearchTerm("76.565.272-3"), "765652723");
  assert.ok(normalizeGlobalSearchTerm("+56 9 6304 0989").includes(normalizeGlobalSearchTerm("963040989")));
});

test("normalizes quote-number searches", () => {
  assert.ok(normalizeGlobalSearchTerm("2026-000045").includes(normalizeGlobalSearchTerm("2026-0000")));
});

test("builds canonical navigation targets", () => {
  assert.equal(globalSearchHref("CUSTOMER", "customer-id"), "/customers/customer-id");
  assert.equal(globalSearchHref("EVENT", "event-id"), "/projects/event-id");
  assert.equal(globalSearchHref("QUOTE", "quote-id"), "/api/commercial/quotes/quote-id/pdf");
});

test("database migration enforces RBAC and relational search sources", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(new URL("../../supabase/migrations/0125_global_search.sql", import.meta.url), "utf8");
  assert.match(sql, /security invoker/i);
  assert.match(sql, /i\.role = 'STAFF'/);
  assert.match(sql, /join public\.customers/);
  assert.match(sql, /project_services/);
  assert.match(sql, /quotation_number/);
  assert.match(sql, /row_number\(\) over\(partition by candidates\.entity_type/);
});
