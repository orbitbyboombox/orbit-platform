import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync("components/layout/sidebar.tsx", "utf8");
const header = readFileSync("components/layout/header.tsx", "utf8");

test("admin sidebar keeps lower navigation reachable in short viewports", () => {
  assert.match(sidebar, /h-\[4\.5rem\].*shrink-0/);
  assert.match(sidebar, /min-h-0 flex-1 overflow-y-auto overscroll-contain/);
  assert.match(sidebar, /Accesos rápidos/);
  assert.match(sidebar, /shrink-0 border-t px-4 py-5/);
});

test("mobile navigation scrolls inside its fixed panel", () => {
  assert.match(header, /max-h-\[calc\(100dvh-5\.5rem\)\] overflow-y-auto overscroll-contain/);
  assert.match(header, /onNavigate=\{\(\) => setMenuOpen\(false\)\}/);
});
