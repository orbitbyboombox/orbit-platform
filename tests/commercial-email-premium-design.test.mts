import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderBoomboxCommercialEmail } from "../features/connectors/google-gmail/application/boombox-commercial-email.html.ts";
import { renderReservationConfirmationHtml } from "../features/connectors/google-gmail/application/reservation-confirmation.html.ts";
import { QUICK_SEND_CTA_LABEL, quickSendInitialBody } from "../features/commercial-hub/presentation.ts";
import { buildSocialPlansEmail } from "../features/commercial-hub/social-plans-email.ts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared premium commercial shell is email-client safe and branded", () => {
  const html = renderBoomboxCommercialEmail({
    preheader: "Tu cotización está lista.",
    eyebrow: "COTIZACIÓN BOOMBOX",
    title: "Tu propuesta está lista",
    contentHtml: "<p>Hola Cliente,</p>",
    website: "https://www.bbox.cl",
    primaryAction: {
      href: "https://orbit.boom-box.cl/documento",
      label: "VER COTIZACIÓN",
    },
    attachmentNote: "Cotización BOOMBOX 2026-001.pdf está incluido como archivo adjunto.",
  });
  assert.match(html, /role="presentation"/);
  assert.match(html, /name="viewport" content="width=device-width,initial-scale=1"/);
  assert.match(html, /width:100%;max-width:640px/);
  assert.match(html, /min-width:260px/);
  assert.match(html, /background:#111214/);
  assert.match(html, /background:#f78900/);
  assert.match(html, />BOOMBOX</);
  assert.match(html, />VER COTIZACIÓN</);
  assert.match(html, /PDF ADJUNTO/);
  assert.match(html, /BOOMBOX · Comunicación emitida mediante ORBIT/);
  assert.match(html, /ORBIT · Software desarrollado por BOOMBOX/);
  assert.match(html, />www\.bbox\.cl</);
  assert.doesNotMatch(html, /Documento y comunicación emitidos/);
  assert.doesNotMatch(html, /class=|<style/);
});

test("Empresa reservation uses the shared premium shell and safe portal CTA", () => {
  const html = renderReservationConfirmationHtml(
    "Hola Cliente,\n\nBIENVENIDOS A BOOMBOX\n\nSERVICIO CONTRATADO\n\nServicio\nClassic\n\nABRIR EVENTO EN ORBIT\n\nEquipo BOOMBOX",
    "https://www.bbox.cl",
    {
      companyCommercial: true,
      portalUrl: "https://orbit.boom-box.cl/portal",
    },
  );
  assert.match(html, /RESERVA CONFIRMADA/);
  assert.match(html, /BIENVENIDOS A BOOMBOX/);
  assert.equal((html.match(/ABRIR EVENTO EN ORBIT/g) ?? []).length, 1);
  assert.match(html, /href="https:\/\/orbit\.boom-box\.cl\/portal"/);
  assert.match(html, /PDF ADJUNTO/);
  assert.doesNotMatch(html, /\/projects\/|token=|access_token/i);
});

test("non-Empresa reservation uses the shared premium renderer", () => {
  const html = renderReservationConfirmationHtml(
    "Hola Cliente,\n\nBIENVENIDOS A BOOMBOX\n\nSERVICIO CONTRATADO\n\nServicio\nClassic",
    "https://www.bbox.cl",
    { companyCommercial: false },
  );
  assert.match(html, /EXPERIENCIAS QUE CONECTAN/);
  assert.match(html, /RESERVA CONFIRMADA/);
  assert.match(html, /SERVICIO CONTRATADO/);
  assert.doesNotMatch(html, /PDF ADJUNTO/);
});

test("formal quote delivery uses premium shell without changing delivery semantics", () => {
  const actions = source("features/commercial-hub/actions.ts");
  assert.match(actions, /renderBoomboxCommercialEmail\(\{/);
  assert.match(actions, /label: "VER COTIZACIÓN"/);
  assert.match(actions, /label: "VER CATÁLOGO EMPRESAS"/);
  assert.match(actions, /attachments: \[\{ filename: attachmentFilename, mimeType: "application\/pdf"/);
  assert.match(actions, /to: recipients\.to, cc: recipients\.cc/);
  assert.match(actions, /idempotency_key: input\.requestId/);
});

test("social information uses the premium shell and canonical catalog destination", () => {
  const actions = source("features/commercial-hub/actions.ts");
  const composer = source("features/commercial-hub/commercial-hub.tsx");
  assert.equal(QUICK_SEND_CTA_LABEL, "VER PLANES Y VALORES");
  assert.match(actions, /buildSocialPlansEmail\(\{/);
  assert.match(actions, /const publicUrl = catalogPublicUrl\(document\.category/);
  assert.match(actions, /textBody: socialEmail\?\.text/);
  assert.match(actions, /recipient_email: input\.email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(actions, /idempotency_key: input\.requestId/);
  assert.match(composer, /srcDoc=\{buildSocialPlansEmail\(\{/);
});

test("social initial copy is concise and removes the obsolete quote checklist", () => {
  const body = quickSendInitialBody("WEDDINGS", "legacy long body");
  assert.match(body, /Hace 16 años creamos experiencias fotográficas/);
  assert.match(body, /NUESTRA PROPUESTA/);
  assert.match(body, /distintas experiencias, formatos y valores disponibles/);
  assert.doesNotMatch(body, /¿QUIERES COTIZAR\?/);
  assert.doesNotMatch(body, /Respóndenos indicando:/);
  assert.doesNotMatch(body, /servicio que te interesa/);
  assert.doesNotMatch(body, /lugar del evento/);
  assert.match(body, /Si alguna alternativa te interesa, respóndenos este correo/);
  assert.match(body, /sujetas a disponibilidad/);
  assert.match(body, /Esperamos ser parte de tu celebración/);
  assert.doesNotMatch(body, /legacy long body/);
  assert.equal(quickSendInitialBody("COMPANIES_CATALOG", "Texto Empresa"), "Texto Empresa");
});

test("Matrimonio and social categories share one premium Planes y Valores renderer", () => {
  const catalogUrl = "https://orbit.boom-box.cl/catalogo/novios";
  for (const category of ["WEDDINGS", "BIRTHDAYS", "GRADUATIONS"]) {
    const body = quickSendInitialBody(category, "configuración antigua");
    const rendered = buildSocialPlansEmail({
      body,
      contact: "joaquín pérez",
      website: "https://www.bbox.cl",
      catalogUrl,
      attachmentFilename: "Planes y Valores BOOMBOX.pdf",
    });
    assert.match(rendered.html, /EXPERIENCIAS PARA TU CELEBRACIÓN/);
    assert.match(rendered.html, /Hola Joaquín Pérez,/);
    assert.match(rendered.html, /Hace 16 años creamos experiencias fotográficas/);
    assert.match(rendered.html, /NUESTRA PROPUESTA/);
    assert.match(rendered.html, />VER PLANES Y VALORES</);
    assert.match(rendered.html, /href="https:\/\/orbit\.boom-box\.cl\/catalogo\/novios"/);
    assert.match(rendered.html, /PDF ADJUNTO/);
    assert.match(rendered.html, /Planes y Valores BOOMBOX\.pdf/);
    assert.doesNotMatch(rendered.html, /¿QUIERES COTIZAR\?/);
    assert.doesNotMatch(rendered.html, /servicio que te interesa|Respóndenos indicando:|lugar del evento/);
    assert.match(rendered.html, /Si alguna alternativa te interesa, respóndenos este correo/);
    assert.match(rendered.html, /Importante:<\/strong> Las fechas se confirman mediante reserva y están sujetas a disponibilidad/);
    assert.match(rendered.html, /BOOMBOX · Comunicación emitida mediante ORBIT/);
    assert.match(rendered.html, /ORBIT · Software desarrollado por BOOMBOX/);
    assert.match(rendered.html, />www\.bbox\.cl</);
    assert.ok(rendered.html.indexOf("Encontrarás el detalle completo") < rendered.html.indexOf("VER PLANES Y VALORES"));
    assert.ok(rendered.html.indexOf("VER PLANES Y VALORES") < rendered.html.indexOf("Si alguna alternativa te interesa"));
  }
});

test("social renderer adapts proposal copy safely when delivery uses the certified link only", () => {
  const rendered = buildSocialPlansEmail({
    body: quickSendInitialBody("BIRTHDAYS", ""),
    contact: "Camila",
    website: "https://www.bbox.cl",
    catalogUrl: "https://orbit.boom-box.cl/catalogo/eventos",
  });
  assert.match(rendered.html, /al abrir Planes y Valores/);
  assert.doesNotMatch(rendered.html, /documento adjunto|PDF ADJUNTO/);
  assert.match(rendered.text, /VER PLANES Y VALORES: https:\/\/orbit\.boom-box\.cl\/catalogo\/eventos/);
});

test("social premium HTML remains safe at Gmail mobile and contained on desktop", () => {
  const html = buildSocialPlansEmail({
    body: quickSendInitialBody("WEDDINGS", ""),
    contact: "Joaquín",
    website: "https://www.bbox.cl",
    catalogUrl: "https://orbit.boom-box.cl/catalogo/novios",
  }).html;
  assert.match(html, /name="viewport" content="width=device-width,initial-scale=1"/);
  assert.match(html, /padding:24px 10px/);
  assert.match(html, /width:100%;max-width:640px/);
  assert.match(html, /min-width:260px/);
  assert.doesNotMatch(html, /width:\s*[7-9][0-9]{2}px|class=|<style/);
});

test("social redesign preserves recipients, optional PDF, idempotency, and Empresa branch", () => {
  const actions = source("features/commercial-hub/actions.ts");
  assert.match(actions, /to: input\.email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(actions, /attachments: downloaded\?\.data \?/);
  assert.match(actions, /idempotency_key: input\.requestId/);
  assert.match(actions, /input\.category !== "COMPANIES_CATALOG"/);
  assert.match(actions, /socialEmail\?\.html \?\? renderBoomboxCommercialEmail/);
});
