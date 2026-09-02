import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderBoomboxCommercialEmail } from "../features/connectors/google-gmail/application/boombox-commercial-email.html.ts";
import { renderReservationConfirmationHtml } from "../features/connectors/google-gmail/application/reservation-confirmation.html.ts";
import { QUICK_SEND_CTA_LABEL, quickSendInitialBody } from "../features/commercial-hub/presentation.ts";

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
  assert.equal(QUICK_SEND_CTA_LABEL, "VER PLANES Y VALORES");
  assert.match(actions, /htmlBody = renderBoomboxCommercialEmail\(\{/);
  assert.match(actions, /primaryAction: \{ href: publicUrl, label: QUICK_SEND_CTA_LABEL \}/);
  assert.match(actions, /primaryActionFallback:/);
  assert.match(actions, /const publicUrl = catalogPublicUrl\(document\.category/);
  assert.match(actions, /textBody: `\$\{quickSendBodyParagraphs/);
  assert.match(actions, /recipient_email: input\.email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(actions, /idempotency_key: input\.requestId/);
});

test("social initial copy is concise, warm, and keeps the required availability notice", () => {
  const body = quickSendInitialBody("WEDDINGS", "legacy long body");
  assert.match(body, /Hace 16 años creamos experiencias fotográficas/);
  assert.match(body, /¿QUIERES COTIZAR\?/);
  assert.match(body, /servicio que te interesa/);
  assert.match(body, /fecha/);
  assert.match(body, /lugar del evento/);
  assert.match(body, /sujetas a disponibilidad/);
  assert.doesNotMatch(body, /legacy long body/);
  assert.equal(quickSendInitialBody("COMPANIES_CATALOG", "Texto Empresa"), "Texto Empresa");
});
