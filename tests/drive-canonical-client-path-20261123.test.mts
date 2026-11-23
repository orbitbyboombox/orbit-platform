import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomerFolderPlan,
  buildRootFolderPlan,
  resolveAutomaticDestination,
} from "../features/connectors/google-drive/application/google-drive-folder-strategy.ts";

test("nueva reserva crea su ruta solo en 01_CLIENTES con el mes en español", () => {
  const plan = buildCustomerFolderPlan("Loreto Gallardo", "2026-11-21", "BOOMBOX ORBIT");
  assert.equal(plan[0].path, "BOOMBOX ORBIT/01_CLIENTES/2026");
  assert.equal(plan[1].path, "BOOMBOX ORBIT/01_CLIENTES/2026/11 NOVIEMBRE");
  assert.equal(plan[2].path, "BOOMBOX ORBIT/01_CLIENTES/2026/11 NOVIEMBRE/21-11-2026 - Loreto Gallardo");
  assert.equal(plan[3].path, `${plan[2].path}/01_Contrato`);
});

test("la ruta automática reutiliza el mismo destino canónico", () => {
  const destination = resolveAutomaticDestination({
    kind: "CONTRACT",
    context: { customerName: "Loreto Gallardo", eventDate: "2026-11-21" },
  }, "BOOMBOX ORBIT");
  assert.equal(destination.folderPath, "BOOMBOX ORBIT/01_CLIENTES/2026/11 NOVIEMBRE/21-11-2026 - Loreto Gallardo/01_Contrato");
});

test("el plan raíz expone 01_CLIENTES y no crea CLIENTES paralelo", () => {
  const paths = buildRootFolderPlan("BOOMBOX ORBIT").map((item) => item.path);
  assert.ok(paths.includes("BOOMBOX ORBIT/01_CLIENTES"));
  assert.equal(paths.includes("BOOMBOX ORBIT/CLIENTES"), false);
});

test("cada año conserva la carpeta canónica de su mes", () => {
  const plan = buildCustomerFolderPlan("Daniela Rodo Perez", "2027-09-10", "BOOMBOX ORBIT");
  assert.equal(plan[1].path, "BOOMBOX ORBIT/01_CLIENTES/2027/09 SEPTIEMBRE");
});
