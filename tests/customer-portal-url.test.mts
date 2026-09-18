import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerPortalUrl } from "../features/customer-portal/customer-portal-url.ts";

test("customer portal URL uses the canonical token route", () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://app.bbox.cl/";
  try {
    assert.equal(buildCustomerPortalUrl("token/with spaces"), "https://app.bbox.cl/p/token%2Fwith%20spaces");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previous;
  }
});
