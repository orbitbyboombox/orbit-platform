import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspacePath = "features/projects/components/project-workspace-experience.tsx";
const routePath = "app/(platform)/projects/[projectId]/page.tsx";

test("event profile exposes one contextual bar with all event destinations", async () => {
  const source = await readFile(workspacePath, "utf8");
  for (const label of ["Resumen", "Cliente", "Servicio", "Finanzas", "Staff", "Operación", "Documentos", "Comunicaciones"]) {
    assert.match(source, new RegExp(`label: "${label}"`));
  }
  assert.match(source, /aria-label="Navegación contextual del evento"/);
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
  const route = await readFile(routePath, "utf8");
  assert.doesNotMatch(source, /aria-label="Secciones del evento"/);
  assert.match(source, /grid-cols-2 gap-2/);
  assert.doesNotMatch(route, /<EventUiReplica/);
  assert.doesNotMatch(route, /operationContent=/);
});

test("quick actions switch to the owning tab before scrolling", async () => {
  const source = await readFile(workspacePath, "utf8");
  const reminder = await readFile("features/projects/communications/pre-event-reminder-control.tsx", "utf8");
  for (const tab of ["DOCUMENTS", "STAFF", "OPERATION", "COMMUNICATIONS"]) {
    assert.match(source, new RegExp(`openTabAndScroll\\("${tab}"`));
  }
  assert.match(source, /ENVIAR CORREO PREEVENTO/);
  assert.match(reminder, /id="pre-event-reminder"/);
});
