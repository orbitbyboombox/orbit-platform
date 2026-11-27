import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const viewer = readFileSync("features/document-viewer/pdf-viewer.tsx", "utf8");

test("visor PDF no depende exclusivamente de onLoad", () => {
  assert.match(viewer, /setTimeout/);
  assert.match(viewer, /setLoadState\("fallback"\)/);
  assert.match(viewer, /const ready = loadState === "ready"/);
  assert.match(viewer, /onError=/);
  assert.match(viewer, /Abrir PDF original/);
});

test("visor PDF mantiene descarga, impresión y retorno seguro", () => {
  assert.match(viewer, /href=\{download\}/);
  assert.match(viewer, /disabled=\{!ready\}/);
  assert.match(viewer, /explicitReturn/);
  assert.match(viewer, /router\.replace\(fallback\)/);
});
