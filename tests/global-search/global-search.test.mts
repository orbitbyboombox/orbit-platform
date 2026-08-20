import assert from "node:assert/strict";
import test from "node:test";
import { globalSearchHref, globalSearchNoResultsMessage, normalizeGlobalSearchTerm } from "../../features/global-search/model.ts";

test("normalizes exact, partial and case-insensitive customer names", () => {
  assert.equal(normalizeGlobalSearchTerm("Soledad Provens"), "soledadprovens");
  assert.ok(normalizeGlobalSearchTerm("Soledad Provens").includes(normalizeGlobalSearchTerm("Sole")));
  assert.equal(normalizeGlobalSearchTerm("SOLEDAD"), normalizeGlobalSearchTerm("soledad"));
});

test("matches customer regression fixtures without business-name hardcoding", () => {
  const searchable = (value: string, query: string) => normalizeGlobalSearchTerm(value).includes(normalizeGlobalSearchTerm(query));
  assert.equal(searchable("Paulina Andrade", "  PAULINA "), true);
  assert.equal(searchable("Soledad Provens", "sole"), true);
  assert.equal(searchable("Soledad Provens", "Provens"), true);
  assert.equal(searchable("SP Wedding Planner", "sp wedding"), true);
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
  assert.equal(globalSearchHref("COMPANY", "customer-id"), "/customers/customer-id");
  assert.equal(globalSearchHref("EVENT", "event-id"), "/projects/event-id");
  assert.equal(globalSearchHref("QUOTE", "quote-id"), "/api/commercial/quotes/quote-id/pdf");
});

test("returns the required no-result state", () => {
  assert.equal(globalSearchNoResultsMessage("  inexistente  "), "No encontramos resultados para “inexistente”.");
});

test("forward migration enforces canonical RBAC and relational search sources", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(new URL("../../supabase/migrations/0150_global_search_canonical_fix.sql", import.meta.url), "utf8");
  assert.match(sql, /security invoker/i);
  assert.match(sql, /public\.is_internal_user\(\)/);
  assert.match(sql, /i\.role = 'STAFF'/);
  assert.match(sql, /join public\.customers/);
  assert.match(sql, /project_services/);
  assert.match(sql, /quotation_number/);
  assert.match(sql, /'COMPANY'::text/);
  assert.match(sql, /upper\(coalesce\(p\.status, ''\)\) not in \('CANCELLED','CANCELED','ARCHIVED'\)/);
  assert.match(sql, /row_number\(\) over\(partition by candidates\.entity_type/);
});

test("global search remains server-side and mobile compatible", async () => {
  const { readFile } = await import("node:fs/promises");
  const [route, component] = await Promise.all([
    readFile(new URL("../../app/api/global-search/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../features/global-search/global-search.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /client\.rpc\("search_orbit_global"/);
  assert.doesNotMatch(route, /\.from\("customers"\)/);
  assert.match(component, /md:hidden/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /encodeURIComponent\(trimmed\)/);
});
