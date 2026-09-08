import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Event Profile exposes net operating profitability and separate collection", async () => {
  const source = await readFile("features/projects/components/project-workspace-experience.tsx", "utf8");
  assert.match(source, /label=\"Ingresos netos\"/);
  assert.match(source, /label=\"Utilidad operacional\"/);
  assert.match(source, /label=\"Margen operacional\"/);
  assert.match(source, /label=\"Recibido\"/);
  assert.match(source, /label=\"Saldo pendiente\"/);
  assert.match(source, /contractedService \+ event\.profit\.revenue\.extras \+ event\.profit\.revenue\.transport - event\.profit\.revenue\.discount/);
});

test("Event Profile exposes current document and reuses canonical confirmation actions", async () => {
  const source = await readFile("features/external-tax-documents/event-commercial-document-hub.tsx", "utf8");
  assert.match(source, /DOCUMENTOS Y CONFIRMACIÓN/);
  assert.match(source, /VER DOCUMENTO VIGENTE/);
  assert.match(source, /AgreementSigningControl/);
  assert.match(source, /currentCommercialDocument/);
  assert.match(source, /Contrato firmado protegido/);
});
