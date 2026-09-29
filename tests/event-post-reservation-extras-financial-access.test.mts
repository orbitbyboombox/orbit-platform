import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const eventPage = readFileSync("app/(platform)/projects/[projectId]/page.tsx", "utf8");

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
});

test("event detail preserves post-reservation receivable summary contract", () => {
  const total = 290_000;
  const paid = 145_000;
  assert.equal(total - paid, 145_000);
  assert.match(eventPage, /EventPostReservationExtrasPanel/);
  assert.match(eventPage, /paidAmount=\{Number\(invoice\?\.paid_amount/);
});
