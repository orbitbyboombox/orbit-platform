import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAccountingFolderPlan,
  buildCancelledReservationFolderPlan,
  buildRootFolderPlan,
  buildStaffFolderPlan,
  resolveAutomaticDestination,
} from "../features/connectors/google-drive/application/google-drive-folder-strategy.ts";

const root = "BOOMBOX ORBIT";

test("plan raíz evita crear STAFF, CLIENTES y otras carpetas paralelas", () => {
  const paths = buildRootFolderPlan(root).map((folder) => folder.path);
  for (const required of ["01_CLIENTES", "02_STAFF", "03_CONTABILIDAD", "04_OPERACIONES", "05_ACTIVOS_Y_RECURSOS", "06_DOCUMENTACION_EMPRESA"]) {
    assert.ok(paths.includes(`${root}/${required}`));
  }
  for (const legacy of ["CLIENTES", "STAFF", "CONTABILIDAD", "OPERACIONES", "ACTIVOS", "DOCUMENTACIÓN"]) {
    assert.ok(!paths.includes(`${root}/${legacy}`));
  }
});

test("destinos de staff y contabilidad coinciden con las raíces oficiales", () => {
  assert.equal(buildStaffFolderPlan("Operador Prueba", root)[0].path, `${root}/02_STAFF/Operador Prueba`);
  assert.equal(buildAccountingFolderPlan("2026-11-23", "Facturas", root)[0].path, `${root}/03_CONTABILIDAD/2026`);
  assert.equal(resolveAutomaticDestination({
    kind: "OPERATOR_DOCUMENT", context: { staffMemberName: "Operador Prueba" },
  }, root).folderPath, `${root}/02_STAFF/Operador Prueba/01 Documentos`);
  assert.equal(resolveAutomaticDestination({
    kind: "ACCOUNTING_INVOICE", context: { documentDate: "2026-11-23" },
  }, root).folderPath, `${root}/03_CONTABILIDAD/2026/November/Facturas`);
});

test("reservas canceladas se archivan bajo 01_CLIENTES", () => {
  const plan = buildCancelledReservationFolderPlan("2026-11-23", root);
  assert.equal(plan.at(-1)?.path, `${root}/01_CLIENTES/Reservas Canceladas/2026/Noviembre`);
});
