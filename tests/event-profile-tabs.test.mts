import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspacePath = "features/projects/components/project-workspace-experience.tsx";

test("event profile exposes the six administrative tabs", async () => {
  const source = await readFile(workspacePath, "utf8");
  for (const label of ["Resumen", "Finanzas", "Staff", "Operación", "Documentos", "Comunicaciones"]) {
    assert.match(source, new RegExp(`label: "${label}"`));
  }
  assert.match(source, /aria-label="Pestañas del evento"/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /aria-selected=\{activeTab === id\}/);
});

test("event profile keeps tab state in the URL for return navigation", async () => {
  const source = await readFile(workspacePath, "utf8");
  assert.match(source, /URLSearchParams\(window\.location\.search\)\.get\("eventTab"\)/);
  assert.match(source, /searchParams\.set\("eventTab", tab\)/);
  assert.match(source, /window\.history\.replaceState/);
});

test("legacy horizontal section navigation is not rendered", async () => {
  const source = await readFile(workspacePath, "utf8");
  assert.doesNotMatch(source, /aria-label="Secciones del evento"/);
  assert.match(source, /className="grid grid-cols-2 gap-2/);
});
