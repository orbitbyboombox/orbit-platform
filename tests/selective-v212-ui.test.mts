import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const source = async (path: string) => readFile(new URL(path, root), "utf8");

test("selective v2.1.2 UI keeps the official logo and visible version", async () => {
  const logo = await source("components/brand-logo.tsx");
  const signature = await source("components/brand-signature.tsx");
  const login = await source("app/page.tsx");
  assert.match(logo, /boombox-official-logo\.png/);
  assert.match(signature, /ORBIT_DISPLAY_VERSION = \"v2\.1\.2\"/);
  assert.match(login, /ORBIT BOOMBOX v2\.1\.2/);
});

test("sidebar scrolls independently while preserving quick actions", async () => {
  const sidebar = await source("components/layout/sidebar.tsx");
  assert.match(sidebar, /h-dvh min-h-0/);
  assert.match(sidebar, /flex-1 overflow-y-auto overscroll-contain/);
  assert.match(sidebar, /Accesos rápidos/);
});
