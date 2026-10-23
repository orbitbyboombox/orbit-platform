import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildCommercialInformationEmail } from "../features/commercial-hub/commercial-email-renderer.ts";

const componentSource = () => readFile(new URL("../features/commercial-hub/commercial-hub.tsx", import.meta.url), "utf8");

test("commercial previews use the final renderer and require explicit confirmation", async () => {
  const source = await componentSource();
  assert.match(source, /buildCommercialInformationEmail/);
  assert.match(source, /<MobileDialog/);
  assert.match(source, /Volver a editar/);
  assert.match(source, /Confirmar y enviar/);
  assert.match(source, /setPreviewSnapshot\(null\)/);
  assert.match(source, /title=\"HTML final del correo comercial\"/);
  assert.match(source, /title=\"HTML final de cotización\"/);
  assert.match(source, /disabled=\{true\} title=\"Debes previsualizar/);
});

test("social and company previews contain the same two commercial actions", () => {
  for (const category of ["WEDDINGS", "BIRTHDAYS", "GRADUATIONS", "COMPANIES_CATALOG"]) {
    const email = buildCommercialInformationEmail({
      category,
      body: "Hola [Nombre],\n\nNUESTRA PROPUESTA",
      contact: "Cliente QA",
      website: "https://app.bbox.cl",
      catalogUrl: "https://app.bbox.cl/catalogo",
      transportUrl: "https://app.bbox.cl/traslados?type=private",
      transportLabel: category === "COMPANIES_CATALOG" ? "CONOCER VALOR DE TRASLADO + IVA" : "CONOCER VALOR DE TRASLADO",
    });
    assert.match(email.html, /VER PLANES Y VALORES/);
    assert.match(email.html, /CONOCER VALOR DE TRASLADO/);
    assert.match(email.html, /https:\/\/app\.bbox\.cl\/traslados/);
  }
});

test("preview changes cannot be confirmed with stale recipient or body", async () => {
  const source = await componentSource();
  assert.match(source, /previewSnapshot\.email !== email/);
  assert.match(source, /emailPreviewSnapshot\.recipient !== recipient/);
  assert.match(source, /emailPreviewSnapshot\.body !== body/);
});
