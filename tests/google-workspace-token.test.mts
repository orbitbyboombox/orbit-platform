import assert from "node:assert/strict";
import test from "node:test";
import { selectRefreshToken } from "../features/connectors/google-workspace/application/refresh-token.ts";

test("new refresh token wins during reconnect", () => {
  assert.equal(selectRefreshToken("new-token", "old-token"), "new-token");
});

test("missing refresh token preserves the previous token", () => {
  assert.equal(selectRefreshToken(undefined, "old-token"), "old-token");
});

test("missing new and previous refresh tokens remains unavailable", () => {
  assert.equal(selectRefreshToken(undefined, null), null);
});
