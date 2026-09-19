import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync("components/layout/sidebar.tsx", "utf8");

test("collapsed sidebar keeps navigation labels hidden at desktop", () => {
  assert.match(sidebar, /compact && \(iconOnly \? "justify-center" : "justify-center lg:justify-start"\)/);
  assert.match(sidebar, /iconOnly \? "hidden" : compact \? "hidden lg:inline"/);
});
