import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const header = readFileSync("components/layout/header.tsx", "utf8");

test("mobile navigation closes on navigation, Escape, and outside press", () => {
  assert.match(header, /useEffect\(\(\) => \{[\s\S]*?setMenuOpen\(false\);[\s\S]*?\}, \[pathname\]\)/);
  assert.match(header, /if \(event\.key === "Escape"\) setMenuOpen\(false\)/);
  assert.match(header, /aria-label="Cerrar navegación"[^>]+className="fixed inset-0[\s\S]*onClick=\{\(\) => setMenuOpen\(false\)\}/);
  assert.match(header, /onNavigate=\{\(\) => setMenuOpen\(false\)\}/);
});

test("mobile navigation owns internal scrolling and locks the page scroll", () => {
  assert.match(header, /document\.body\.style\.overflow = "hidden"/);
  assert.match(header, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(header, /document\.removeEventListener\("keydown", onKeyDown\)/);
  assert.match(header, /max-h-\[calc\(100dvh-5\.5rem\)\] overflow-y-auto overscroll-contain/);
});

test("mobile navigation remains constrained to the mobile breakpoint", () => {
  assert.match(header, /fixed inset-x-3 top-\[4\.75rem\][\s\S]*md:hidden/);
  assert.match(header, /fixed inset-0 z-30[\s\S]*md:hidden/);
});
