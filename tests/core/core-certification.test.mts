import assert from "node:assert/strict";
import test from "node:test";
import { isAdministrativeRole, unauthorizedLandingForRole } from "../../lib/auth/roles.ts";
import { groupByOwnerId } from "../../features/crm/relations.ts";
import { filterExtrasForEventType, includedExtrasForEventType, resolveBrandingMinimum } from "../../features/projects/reservation-business-rules.ts";

test("only CEO and ADMINISTRATOR can enter administrative ORBIT", () => {
  assert.equal(isAdministrativeRole("CEO"), true);
  assert.equal(isAdministrativeRole("ADMINISTRATOR"), true);
  assert.equal(isAdministrativeRole("STAFF"), false);
  assert.equal(isAdministrativeRole("CUSTOMER"), false);
  assert.equal(unauthorizedLandingForRole("STAFF"), "/login?access=staff");
  assert.equal(unauthorizedLandingForRole("CUSTOMER"), "/login?access=customer");
});

test("one customer owns multiple independent events", () => {
  const grouped = groupByOwnerId([{ id: "event-1", customerId: "customer-1" }, { id: "event-2", customerId: "customer-1" }, { id: "event-3", customerId: "customer-2" }], "customerId");
  assert.deepEqual(grouped.get("customer-1")?.map((event) => event.id), ["event-1", "event-2"]);
});

test("one event owns multiple independent services", () => {
  const grouped = groupByOwnerId([{ id: "service-1", projectId: "event-1" }, { id: "service-2", projectId: "event-1" }], "projectId");
  assert.equal(grouped.get("event-1")?.length, 2);
});

test("corporate extras exclude Scrapbook and preserve configured pricing rules", () => {
  assert.deepEqual(filterExtrasForEventType("Corporate", ["Branding", "QR", "Scrapbook"]), ["Branding", "QR"]);
  assert.deepEqual(includedExtrasForEventType("Wedding"), ["QR", "Scrapbook"]);
  assert.equal(resolveBrandingMinimum(2), 2);
});
