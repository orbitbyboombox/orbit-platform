import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerFolderPlan, resolveAutomaticDestination } from "../features/connectors/google-drive/application/google-drive-folder-strategy.ts";

test("November event uses consolidated Spanish month under 01_CLIENTES", () => {
  const plan = buildCustomerFolderPlan("Laura Agudelo", "2026-11-20", "BOOMBOX ORBIT");
  assert.equal(plan[0].path, "BOOMBOX ORBIT/01_CLIENTES");
  assert.equal(plan[2].path, "BOOMBOX ORBIT/01_CLIENTES/2026/11 NOVIEMBRE");
  assert.equal(plan[3].path, "BOOMBOX ORBIT/01_CLIENTES/2026/11 NOVIEMBRE/20-11-2026 - Laura Agudelo");
});

test("December receipt is routed to consolidated customer folder", () => {
  const destination = resolveAutomaticDestination({
    kind: "PAYMENT_PROOF",
    context: { customerName: "Natalia Del Canto", eventDate: "2026-12-02" },
  }, "BOOMBOX ORBIT");
  assert.equal(destination.folderPath, "BOOMBOX ORBIT/01_CLIENTES/2026/12 DICIEMBRE/02-12-2026 - Natalia Del Canto/02_Comprobantes");
});
