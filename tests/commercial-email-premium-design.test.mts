import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderBoomboxCommercialEmail } from "../features/connectors/google-gmail/application/boombox-commercial-email.html.ts";
import { renderReservationConfirmationHtml } from "../features/connectors/google-gmail/application/reservation-confirmation.html.ts";

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
  assert.match(html, /background:#111214/);
  assert.match(html, /background:#f78900/);
  assert.match(html, />BOOMBOX</);
  assert.match(html, />VER COTIZACIÓN</);
  assert.match(html, /PDF ADJUNTO/);
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

test("non-Empresa reservation keeps the established renderer", () => {
  const html = renderReservationConfirmationHtml(
    "¡Tu reserva BOOMBOX está confirmada!\n\nHola Cliente,",
    "https://www.bbox.cl",
    { companyCommercial: false },
  );
  assert.match(html, /background:#f6f4ef/);
  assert.doesNotMatch(html, /EXPERIENCIAS QUE CONECTAN|PDF ADJUNTO/);
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
