import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildCommercialInformationEmail, CATALOG_BOOMBOX_LOGO_URL } from "../features/commercial-hub/commercial-email-renderer.ts";

const componentSource = () => readFile(new URL("../features/commercial-hub/commercial-hub.tsx", import.meta.url), "utf8");
const actionSource = () => readFile(new URL("../features/commercial-hub/actions.ts", import.meta.url), "utf8");

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
    assert.match(email.html, /CONSULTAR VALOR DE TRASLADO/);
    assert.match(email.html, /https:\/\/app\.bbox\.cl\/traslados/);
    assert.match(email.html, /#fff9f2/);
    assert.match(email.html, /#101216/);
    assert.match(email.html, /BOOMBOX/);
    assert.match(email.html, /https:\/\/app\.bbox\.cl\/branding\/boombox-official-logo-transparent\.png/);
    assert.match(email.html, /href="https:\/\/www\.bbox\.cl"/);
    assert.doesNotMatch(email.html, /boom-box\.cl/);
  }
});

test("catalog delivery uses the same light renderer while formal quotes stay separate", async () => {
  const source = await actionSource();
  assert.match(source, /const renderedEmail = buildCommercialInformationEmail/);
  assert.match(source, /const htmlBody = renderedEmail\.html/);
  assert.match(source, /textBody: renderedEmail\.text/);
  assert.match(source, /renderBoomboxCommercialEmail/);
  assert.doesNotMatch(source, /buildSocialPlansEmail/);
});

test("catalog HTML centralizes the clean BOOMBOX closing and ignores personal signatures", () => {
  const email = buildCommercialInformationEmail({
    category: "WEDDINGS",
    body: "Hola [Nombre],\n\nGracias por considerar a BOOMBOX.\n\n**Importante:** Las fechas se confirman mediante reserva y están sujetas a disponibilidad.\n\nQuedamos atentos.\n\nUn abrazo,\n\nEquipo BOOMBOX",
    contact: "Cliente QA",
    website: "https://www.boom-box.cl/",
    catalogUrl: "https://app.bbox.cl/catalogo/novios",
    transportUrl: "https://app.bbox.cl/traslados?type=private",
    transportLabel: "CONOCER VALOR DE TRASLADO",
    signatureUrl: "https://example.invalid/matias-signature.gif",
  });
  assert.match(email.html, new RegExp(CATALOG_BOOMBOX_LOGO_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(email.html, /Si tienes dudas o necesitas más información, estaremos encantados de ayudarte\./);
  assert.match(email.html, /Equipo BOOMBOX®/);
  assert.match(email.html, /Las fechas están sujetas a disponibilidad y se confirman mediante reserva\./);
  assert.match(email.html, /www\.bbox\.cl/);
  assert.match(email.html, /href="https:\/\/www\.bbox\.cl"/);
  assert.doesNotMatch(email.html, /boom-box\.cl/);
  assert.doesNotMatch(email.html, /matias-signature/);
  assert.doesNotMatch(email.html, /Comunicación emitida mediante ORBIT|Software desarrollado por BOOMBOX/);
  assert.doesNotMatch(email.html, /Quedamos atentos|\*\*Importante:\*\*/);
});

test("preview changes cannot be confirmed with stale recipient or body", async () => {
  const source = await componentSource();
  assert.match(source, /previewSnapshot\.email !== email/);
  assert.match(source, /emailPreviewSnapshot\.recipient !== recipient/);
  assert.match(source, /emailPreviewSnapshot\.body !== body/);
});
