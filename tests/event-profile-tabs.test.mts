import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspacePath = "features/projects/components/project-workspace-experience.tsx";
const pagePath = "app/(platform)/projects/[projectId]/page.tsx";
const replicaPath = "features/projects/components/event-ui-replica.tsx";

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
  assert.match(source, /grid-cols-2 gap-2/);
});

test("event route exposes the tabbed workspace instead of hiding it in the legacy accordion", async () => {
  const page = await readFile(pagePath, "utf8");
  const replica = await readFile(replicaPath, "utf8");
  assert.match(page, /<EventUiReplica[\s\S]*?tabbedWorkspace/);
  assert.match(replica, /tabbedWorkspace\?: boolean/);
  assert.match(replica, /if \(tabbedWorkspace && operationContent\)/);
});

test("each administrative tab gates its owned modules", async () => {
  const source = await readFile(workspacePath, "utf8");
  for (const tab of ["SUMMARY", "FINANCE", "STAFF", "OPERATION", "DOCUMENTS", "COMMUNICATIONS"]) {
    assert.match(source, new RegExp(`activeTab === \\"${tab}\\"`));
  }
  assert.match(source, /activeTab === "FINANCE" && <CustomerEventOperations/);
  assert.match(source, /activeTab === "STAFF" && moduleVisible\("STAFF"\)/);
  assert.match(source, /activeTab === "OPERATION" && <EventLogisticsCenter/);
  assert.match(source, /activeTab === "DOCUMENTS" && moduleVisible\("DOCUMENTS"\)/);
  assert.match(source, /activeTab === "COMMUNICATIONS" && moduleVisible\("TIMELINE"\)/);
});

test("secondary actions are collapsed and cross-tab actions switch surface first", async () => {
  const source = await readFile(workspacePath, "utf8");
  assert.match(source, /<summary className=.*>Más acciones<\/summary>/);
  assert.match(source, /openModule\("DOCUMENTS", "agreement-control"\)/);
  assert.match(source, /openModule\("STAFF", "staff-assignment"\)/);
  assert.match(source, /openModule\("COMMUNICATIONS", "pre-event-reminder"\)/);
  assert.match(source, /className="sticky top-0 z-20/);
});

test("event summary keeps compact responsive proportions", async () => {
  const source = await readFile(workspacePath, "utf8");
  assert.match(source, /space-y-4 pb-8 sm:space-y-5/);
  assert.match(source, /grid min-w-0 items-start gap-4 sm:gap-5 xl:grid-cols-2/);
  assert.match(source, /lg:w-auto lg:max-w-none/);
  assert.match(source, /\[&>button\]:w-full \[&>button\]:whitespace-normal/);
  assert.match(source, /rounded-2xl border bg-card p-4 sm:p-5/);
});

test("mixed CustomerEventOperations surfaces are explicitly scoped", async () => {
  const source = await readFile("features/crm/customer-event-operations.tsx", "utf8");
  assert.match(source, /type CustomerEventOperationsSurface = "FINANCE" \| "DOCUMENTS" \| "COMMUNICATIONS"/);
  assert.match(source, /surface === "FINANCE"/);
  assert.match(source, /surface === "DOCUMENTS"/);
  assert.match(source, /surface === "COMMUNICATIONS"/);
});
