import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the real Founder dashboard exposes BIANCA to the canonical customization system", async () => {
  const workspace = await read("features/founder-workspace/founder-workspace-experience.tsx");
  const personal = await read("features/founder-workspace/personal-workspace.tsx");
  assert.match(workspace, /DASHBOARD_BIANCA/);
  assert.match(workspace, /DASHBOARD_BIANCA/);
  assert.match(workspace, /Ordenar escritorio/);
  assert.match(personal, /Secciones ocultas/);
  assert.match(personal, /Ocultar/);
  assert.match(personal, /Mostrar/);
  assert.match(personal, /draggable=\{editing && reorderEnabled\}/);
});

test("dashboard visibility is independent from WhatsApp and delivery gates", async () => {
  const workspace = await read("features/founder-workspace/founder-workspace-experience.tsx");
  const operations = await read("app/(platform)/operations/page.tsx");
  assert.match(workspace, /ABRIR BIANCA/);
  assert.match(workspace, /BIANCA Lab/);
  assert.match(operations, /FounderWorkspaceExperience/);
  assert.doesNotMatch(workspace, /whatsappConnected && biancaStatus/);
});

test("platform authorization remains restricted to Founder/Admin roles", async () => {
  const layout = await read("app/(platform)/layout.tsx");
  assert.match(layout, /CEO.*ADMINISTRATOR/);
  assert.doesNotMatch(layout, /STAFF.*BIANCA/);
});

test("legacy BIANCA hidden state migrates once while explicit new hides persist", async () => {
  const repository = await read("features/founder-workspace/repository.ts");
  const layout = await read("features/founder-workspace/dashboard-layout.ts");
  const actions = await read("features/founder-workspace/actions.ts");
  assert.match(repository, /storedDashboardVersion < 2/);
  assert.match(repository, /DASHBOARD_BIANCA/);
  assert.match(repository, /Math\.max\(2, storedDashboardVersion/);
  assert.match(layout, /DASHBOARD_LAYOUT_VERSION = 2/);
  assert.match(actions, /dashboard_layout_version: value\.dashboardLayout\.version/);
  assert.match(repository, /sectionOrder/);
});
