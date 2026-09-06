import test from "node:test";
import assert from "node:assert/strict";
import { isAdministrativeRole, isMetaReviewerRole } from "../lib/auth/roles.ts";

test("Meta reviewer role is distinct from administrative roles", () => {
  assert.equal(isMetaReviewerRole("META_REVIEWER"), true);
  assert.equal(isAdministrativeRole("META_REVIEWER"), false);
  assert.equal(isAdministrativeRole("CEO"), true);
});
