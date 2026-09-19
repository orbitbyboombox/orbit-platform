import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync("components/layout/sidebar.tsx", "utf8");
const shell = readFileSync("components/layout/app-shell.tsx", "utf8");
const header = readFileSync("components/layout/header.tsx", "utf8");

test("sidebar uses the premium responsive BOOMBOX brand header", () => {
  assert.match(sidebar, /data-brand-header/);
  assert.match(sidebar, /h-20[^\n]*lg:h-24/);
  assert.match(sidebar, /max-w-\[13rem\] lg:max-w-\[15rem\]/);
  assert.match(sidebar, /max-w-\[3rem\] lg:max-w-\[3\.25rem\]/);
  assert.match(sidebar, /priority surface="dark"/);
  assert.match(sidebar, /focus-visible:ring-2 focus-visible:ring-brand\/60/);
});

test("layout reserves space for expanded and compact sidebar states", () => {
  assert.match(sidebar, /md:w-\[14rem\] lg:w-\[16\.5rem\]/);
  assert.match(shell, /md:pl-\[14rem\] lg:pl-\[16\.5rem\]/);
  assert.match(shell, /peer-data-\[collapsed=true\]:lg:pl-20/);
  assert.match(header, /sm:w-36 lg:hidden/);
});
