import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const login = readFileSync("app/page.tsx", "utf8");
const shell = readFileSync("components/layout/sidebar.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const logo = "public/branding/boombox-official-logo.png";

test("desktop login branding uses the official left-aligned logo asset", () => {
  assert.match(login, /brand-panel-logo/);
  assert.match(css, /\.brand-panel-main\{[^}]*align-items:flex-start/);
  assert.match(css, /\.brand-panel-logo\{[^}]*margin:0;/);
  assert.match(css, /\.brand-panel-logo\{[^}]*width:min\(100%,400px\)/);
  assert.ok(readFileSync(logo).length > 100_000);
  assert.match(readFileSync("components/brand-logo.tsx", "utf8"), /aspect-\[1672\/941\]/);
});

test("expanded sidebar increases logo presence without changing shell width", () => {
  assert.match(shell, /max-w-\[11rem\]/);
  assert.match(shell, /lg:w-\[15\.25rem\]/);
  assert.match(shell, /collapsed \? "lg:w-20"/);
  assert.match(shell, /variant="isotype"/);
});

test("responsive branding keeps tablet/mobile sizing rules", () => {
  assert.match(css, /@media\(max-width:900px\) and \(min-width:761px\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.brand-panel-logo\{width:min\(100%,300px\);margin:0 auto/);
});
