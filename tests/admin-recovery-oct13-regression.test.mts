import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin recovery retains Office and Boxes with real pages and handlers", () => {
  const nav = read("components/layout/navigation.ts");
  assert.match(nav, /key: "OFFICE_RENT"/);
  assert.match(nav, /href: "\/office-rent"/);
  assert.match(nav, /key: "BOXES"/);
  assert.match(nav, /href: "\/resources\/boxes"/);
  assert.match(read("app/(platform)/office-rent/page.tsx"), /loadOfficeLeaseDataset/);
  assert.match(read("app/(platform)/resources/boxes/page.tsx"), /loadBoxes/);
  assert.match(read("features/resources/box-inventory.ts"), /box_media_lots/);
});

test("actionable founder approvals stay above personalizable dashboard sections", () => {
  const dashboard = read("features/founder-workspace/founder-workspace-experience.tsx");
  assert.match(dashboard, /reviewCount > 0 \? <div className="mb-4" data-fixed-founder-pending-review>\{actionCenter\}/);
  assert.match(dashboard, /Pendientes por revisar/);
  assert.doesNotMatch(dashboard, /const commandGrid =[^\n]*\{actionCenter\}/);
});

test("event finance tab retains itemized estimated costs", () => {
  const page = read("features/projects/components/project-workspace-experience.tsx");
  assert.match(page, /eventTab === "finance" && moduleVisible\("FINANCIAL_SUMMARY"\) && \(\s*<Section\s*eyebrow="05 · Costos automáticos"/);
  for (const label of ["Papel", "Operador", "Montaje", "Desmontaje", "Combustible adicional"]) {
    assert.ok(page.includes(`label="${label}"`), `missing itemized cost: ${label}`);
  }
});

test("customer portal and staff portal remain in place during admin-only recovery", () => {
  const staff = read("features/portal-authentication/staff-portal.tsx");
  const staffDashboard = read("features/portal-authentication/staff-portal-dashboard.tsx");
  assert.ok(staff.length > 500);
  assert.ok(staffDashboard.length > 500);
});
