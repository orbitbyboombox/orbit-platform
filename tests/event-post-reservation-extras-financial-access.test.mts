import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const eventPage = readFileSync("app/(platform)/projects/[projectId]/page.tsx", "utf8");
const workspace = readFileSync("features/projects/components/project-workspace-experience.tsx", "utf8");

test("event detail keeps protected financial records server-only", () => {
  assert.match(eventPage, /const adminReadClient = createAdminClient\(\);/);
  assert.match(
    eventPage,
    /adminReadClient\s*\.from\("financial_event_records"\)[\s\S]*?operational_cost:total_operational_cost/,
  );
  assert.match(
    eventPage,
    /adminReadClient\s*\.from\("financial_event_records"\)[\s\S]*?total_operational_cost,gross_profit/,
  );
  assert.doesNotMatch(
    eventPage,
    /client\s*\.from\("financial_event_records"\)/,
  );
  assert.match(eventPage, /calculateAndPersistRealEventCost\(adminReadClient, projectId\)/);
  assert.match(eventPage, /new SupabaseCustomerRepository\(client\)\.findById\(projectId\)/);
  assert.ok(eventPage.indexOf("if (!project) notFound()") < eventPage.indexOf("calculateAndPersistRealEventCost(adminReadClient, projectId)"));
  assert.match(eventPage, /client\s*\.from\("accounts_receivable_projection"\)[\s\S]*?\.eq\("project_id", projectId\)/);
});

test("event detail preserves post-reservation receivable summary contract", () => {
  assert.match(eventPage, /receivable: invoice[\s\S]*?paidAmount: Number\(invoice\.paid_amount\)/);
  assert.match(workspace, /<EventPostReservationExtrasPanel[\s\S]*?paidAmount=\{event\.receivable\?\.paidAmount \?\? 0\}/);
  assert.match(workspace, /currentTotal=\{\(event\.receivable\?\.amount \?\? 0\) \+ props\.postReservationExtras\.filter\(\(item\) => item\.status === "ACTIVE"\)/);
});
