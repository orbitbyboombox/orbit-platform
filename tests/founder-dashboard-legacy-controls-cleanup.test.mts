import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const workspace = readFileSync(
  new URL("features/founder-workspace/personal-workspace.tsx", root),
  "utf8",
);
const dashboard = readFileSync(
  new URL("features/founder-workspace/founder-workspace-experience.tsx", root),
  "utf8",
);

test("legacy three-dot controls are excluded only from Dashboard", () => {
  assert.match(workspace, /moduleKey === "DASHBOARD"/);
  assert.match(
    workspace,
    /if \(!context \|\| !moduleKey \|\| moduleKey === "DASHBOARD"\) return null/,
  );
  assert.match(workspace, /aria-label=\{`Administrar \$\{label\}`\}/);
});

test("Dashboard reordering is enabled only by Ordenar escritorio mode", () => {
  assert.match(dashboard, /reorderEnabled=\{ordering\}/);
  assert.match(workspace, /draggable=\{reorderEnabled\}/);
  assert.match(dashboard, /ordering \? "Terminar" : "Ordenar escritorio"/);
});

test("non-reorder workspace functionality remains available outside Dashboard", () => {
  assert.match(workspace, /Ocultar sección/);
  assert.match(dashboard, /href="\/settings#founder-workspace"/);
  assert.doesNotMatch(dashboard, /Administrar Próximos eventos/);
});
