import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
  assert.equal((html.match(/boombox-official-logo\.png/g) ?? []).length, 2);
  assert.match(html, /alt="BOOMBOX®"/);
  assert.match(html, />VER COTIZACIÓN</);
  assert.match(html, /PDF ADJUNTO/);
  assert.match(html, /<a href="https:\/\/www\.bbox\.cl"[^>]*>www\.bbox\.cl<\/a>/);
  assert.match(html, /COMUNICACIÓN EMITIDA MEDIANTE ORBIT SOFTWARE DESARROLLADO POR BOOMBOX®/);
  assert.doesNotMatch(html, /PRODUCCIONES BOOMBOX COMPANY SPA/);
  assert.doesNotMatch(html, />BOOMBOX</);
  assert.doesNotMatch(html, /Documento y comunicación emitidos/);
  assert.doesNotMatch(html, /class=|<style/);
});

test("automatic booking invitation uses the canonical BOOMBOX welcome base", () => {
  const service = source("features/automatic-booking/automatic-booking.service.ts");
  const html = renderBoomboxCommercialEmail({
    preheader: "Tu acceso ya está listo.",
    eyebrow: "",
    title: "¡Bienvenido a BOOMBOX!",
    headerLabel: "EVENTOS QUE CONECTAN",
    stackedHeader: true,
    contentHtml: "<p>Tu experiencia comienza aquí.</p>",
    benefits: ["Completar los datos de tu evento", "Elegir tus servicios", "Revisar tu contrato", "Confirmar tu reserva"],
    closingLine: "Cada evento cuenta. Tu experiencia comienza con BOOMBOX.",
    website: "https://www.bbox.cl",
    primaryAction: { href: "https://app.bbox.cl/booking/fixture", label: "COMPLETAR MI RESERVA  →" },
  });
  assert.match(service, /renderBoomboxCommercialEmail\(/);
  assert.doesNotMatch(service, /<div style=\"font-family:Arial,sans-serif;max-width:560px/);
  assert.match(html, /<h1[^>]*>¡Bienvenido a BOOMBOX!<\/h1>/);
  assert.doesNotMatch(html, /<p[^>]*color:#f78900[^>]*>BOOMBOX<\/p>/);
  assert.match(html, /Una vez dentro podrás:/);
  assert.match(html, /EXPERIENCIAS<br>RECUERDOS<br>MOMENTOS/);
  assert.match(html, /background:#0b0c0e/);
  assert.match(html, /COMPLETAR MI RESERVA/);
  assert.match(html, /boombox-official-logo\.png/);
  assert.equal((html.match(/boombox-official-logo\.png/g) ?? []).length, 2);
  assert.match(html, /<a href="https:\/\/www\.bbox\.cl"[^>]*>www\.bbox\.cl<\/a>/);
  assert.match(html, /COMUNICACIÓN EMITIDA MEDIANTE ORBIT SOFTWARE DESARROLLADO POR BOOMBOX®/);
  assert.match(html, /margin-top:4px[^>]*>EVENTOS QUE CONECTAN/);
  assert.match(html, /margin:38px 0 0;border-top:1px solid #343538;padding-top:30px/);
});

test("official BOOMBOX logo asset and confirmation finance/portal contrast are canonical", () => {
  assert.equal(existsSync("public/branding/boombox-official-logo.png"), true);
  const html = renderReservationConfirmationHtml(
    "Hola Cliente,\n\nBIENVENIDOS A BOOMBOX\n\nSERVICIO CONTRATADO\n\nValor total\n$450.000\n\nAbono recibido\n$225.000\n\nSaldo pendiente\n$225.000\n\nABRIR EVENTO EN ORBIT",
    "https://www.bbox.cl",
    { companyCommercial: false, portalUrl: "https://orbit.boom-box.cl/portal" },
  );
  assert.match(html, /color:#ffffff[^>]*>\$450\.000/);
  assert.match(html, /color:#ffffff;font-size:15px[^>]*>\$225\.000/);
  assert.match(html, /Para ingresar a tu Portal BOOMBOX, utiliza tu RUT y la fecha de tu evento\./);
  assert.match(html, /boombox-official-logo\.png/);
  assert.match(source("components/brand-logo.tsx"), /boombox-official-logo\.png/);
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
    assert.match(rendered.html, /COMUNICACIÓN EMITIDA MEDIANTE ORBIT SOFTWARE DESARROLLADO POR BOOMBOX®/);
    assert.match(rendered.html, /<a href="https:\/\/www\.bbox\.cl"[^>]*>www\.bbox\.cl<\/a>/);
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

test("graphical BOOMBOX signature stays compact across every email sender", () => {
  const senders = [
    source("features/commercial-hub/actions.ts"),
    source("features/commercial-hub/social-plans-email.ts"),
    source("features/connectors/whatsapp-cloud/whatsapp-catalog.delivery.ts"),
  ].join("\n");
  assert.equal((senders.match(/max-width:420px/g) ?? []).length, 4);
  assert.doesNotMatch(senders, /max-width:600px/);
  assert.match(source("features/commercial-hub/commercial-hub.tsx"), /max-w-\[420px\]/);
});
