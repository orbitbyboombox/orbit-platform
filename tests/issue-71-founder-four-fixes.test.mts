import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync("features/projects/components/project-workspace-experience.tsx", "utf8");
const serviceEditor = readFileSync("features/projects/components/inline-service-editor.tsx", "utf8");
const serviceAction = readFileSync("features/projects/actions/service-change.actions.ts", "utf8");

test("Issue 71 keeps service editing safe and exposes the authorized review path", () => {
  assert.match(serviceEditor, /data-issue71-service-lock/);
  assert.match(serviceEditor, /eventTab=finance/);
  assert.match(serviceEditor, /disabled=\{!canSave\|\|pending\}/);
  assert.match(serviceAction, /quotations/);
  assert.match(serviceAction, /paid_amount/);
  assert.match(serviceAction, /project_services/);
});

test("Issue 72 exposes a review action when an event has multiple services", () => {
  assert.match(workspace, /data-issue72-service-review/);
  assert.match(workspace, /data-issue72-service-review-link/);
  assert.match(workspace, /varios servicios/);
});

test("Issue 71 makes finance figures readable without changing their source", () => {
  assert.match(workspace, /data-issue71-finance-summary/);
  assert.match(workspace, /grid min-w-0 grid-cols-1 gap-3 \@\[28rem\]:grid-cols-2 \@\[56rem\]:grid-cols-3/);
  assert.match(workspace, /whitespace-nowrap text-base font-semibold tabular-nums/);
  assert.match(workspace, /event\.profit\.costs\.totalOperationalCost/);
});

test("Issue 71 separates event designs from commercial documents", () => {
  assert.match(workspace, /data-issue72-documents-layout/);
  assert.match(workspace, /data-issue71-designs-section/);
  assert.match(workspace, /data-issue71-commercial-documents-section/);
  assert.match(workspace, /@\[60rem\]:grid-cols-2/);
  assert.match(workspace, /EventDesignCenter documents=\{eventDesignDocuments\}/);
  assert.match(workspace, /EventCommercialDocumentHub/);
});

test("Issue 71 exposes canonical payables and advances from Staff", () => {
  assert.match(workspace, /data-issue71-staff-finance-links/);
  assert.match(workspace, /href="\/finance\/payables"/);
  assert.match(workspace, /data-issue71-advances-link/);
  assert.match(workspace, /href="\/resources\/staff\?payroll=1"/);
  assert.equal((workspace.match(/data-issue71-advances-link/g) ?? []).length, 1);
});

test("Issue 71 preserves independent event tab panels", () => {
  for (const tab of ["summary", "finance", "staff", "operations", "documents", "communications"]) {
    assert.match(workspace, new RegExp(`eventTab === "${tab}"`));
  }
  assert.match(workspace, /selectEventTab\("operations"\)/);
});
