import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync("features/projects/components/project-workspace-experience.tsx", "utf8");
const page = readFileSync("app/(platform)/projects/[projectId]/page.tsx", "utf8");

test("event workspace exposes the canonical photo style values and persists them through the existing action", () => {
  assert.match(workspace, /updateEventPrintInstructionsAction/);
  assert.match(workspace, /\[\"COLOR\", \"BLACK_WHITE\", \"SEPIA\"\]/);
  assert.match(workspace, /BLANCO Y NEGRO/);
  assert.match(workspace, /PENDIENTE/);
  assert.match(workspace, /photoStyle/);
  assert.match(
    workspace,
    /activeTab === "OPERATION" && \(\s*<Section[\s\S]*id="print-instructions"/,
  );
  assert.doesNotMatch(
    workspace,
    /activeTab === "OPERATION" && moduleVisible\("OPERATIONAL_CONTROL"\) && \(\s*<OptionalModule[\s\S]*id="print-instructions"/,
  );
  assert.match(page, /operationalContract\.photo_style/);
  assert.match(page, /operator_print_notes/);
});
