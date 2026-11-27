import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { renderBoomboxCommercialEmail } from "../features/connectors/google-gmail/application/boombox-commercial-email.html.ts";
import { renderReservationConfirmationHtml } from "../features/connectors/google-gmail/application/reservation-confirmation.html.ts";
import { QUICK_SEND_CTA_LABEL, quickSendInitialBody } from "../features/commercial-hub/presentation.ts";
import { buildSocialPlansEmail } from "../features/commercial-hub/social-plans-email.ts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");


test("shared dark commercial shell keeps official branding and table-based email CTAs", () => {
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
  assert.match(html, /width:270px;max-width:100%/);
  assert.match(html, /background-color:#111214/);
  assert.match(html, /<table class="orbit-action"[^>]*role="presentation"[^>]*><tr><td[^>]*bgcolor="#f78900"[^>]*mso-padding-alt:15px 24px/);
  assert.equal((html.match(/boombox-official-logo\.png/g) ?? []).length, 2);
  assert.match(html, /alt="BOOMBOX®"/);
  assert.match(html, /href="https:\/\/orbit\.boom-box\.cl\/documento"[^>]*>VER COTIZACIÓN</);
  assert.match(html, /PDF ADJUNTO/);
  assert.match(html, /<a href="https:\/\/www\.bbox\.cl"[^>]*>www\.bbox\.cl<\/a>/);
  assert.match(html, /BOOMBOX · Comunicación emitida mediante ORBIT<\/span><br>ORBIT · Software desarrollado por BOOMBOX/);
  assert.doesNotMatch(html, /PRODUCCIONES BOOMBOX COMPANY SPA|Documento y comunicación emitidos/);
  assert.match(html, /@media only screen and \(max-width:520px\)/);
  assert.match(html, /class="orbit-body"/);
  assert.match(html, /class="orbit-action-link"/);
});


test("automatic booking invitation uses the canonical BOOMBOX welcome base and a one-time link", () => {
  const service = source("features/automatic-booking/automatic-booking.service.ts");
  assert.match(service, /const htmlBody = renderBoomboxCommercialEmail\(\{/);
  assert.match(service, /title: "¡Bienvenido a BOOMBOX!"/);
  assert.match(service, /headerLabel: "EVENTOS QUE CONECTAN"/);
  for (const text of ["Una vez dentro podrás", "Completar los datos de tu evento", "Elegir tus servicios", "Revisar tu contrato", "Confirmar tu reserva"])
    assert.ok(service.includes(text));
  assert.match(service, /primaryAction: \{ href: url, label: "COMPLETAR MI RESERVA" \}/);
  assert.match(service, /Este enlace es personal, vence en 7 días y funciona una sola vez/);
  assert.match(service, /const url = `\$\{appOrigin\(\)\}\/booking\/\$\{token\}`/);
  assert.match(service, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(service, /token_hash: hash\(token\), expires_at: expiresAt/);
  assert.match(service, /to: customerEmail, from: senderEmail,[^\n]+htmlBody/);
  assert.doesNotMatch(service, /<div style="font-family:Arial,sans-serif;max-width:560px/);
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
  assert.match(actions, /const htmlBody = renderPremiumQuotationEmail\(\{/);
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
  assert.match(actions, /textBody: socialEmail\.text/);
  assert.match(actions, /recipient_email: input\.email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(actions, /idempotency_key: input\.requestId/);
  assert.match(composer, /srcDoc=\{buildSocialPlansEmail\(\{/);
});

test("social initial copy is concise and removes the obsolete quote checklist", () => {
  const body = quickSendInitialBody("WEDDINGS", "legacy long body");
  assert.match(body, /Desde hace 16 años/);
  assert.match(body, /NUESTRA PROPUESTA/);
  assert.match(body, /Hemos preparado nuestras alternativas/);
  assert.doesNotMatch(body, /¿QUIERES COTIZAR\?/);
  assert.doesNotMatch(body, /Respóndenos indicando:/);
  assert.doesNotMatch(body, /servicio que te interesa/);
  assert.doesNotMatch(body, /lugar del evento/);
  assert.match(body, /Quedamos atentos por si tienes dudas/);
  assert.match(body, /sujetas a disponibilidad/);
  assert.match(body, /Esperamos ser parte de tu matrimonio/);
  assert.doesNotMatch(body, /legacy long body/);
  assert.match(quickSendInitialBody("COMPANIES_CATALOG", "Texto Empresa"), /Gracias por considerar a BOOMBOX/);
});


test("Matrimonio and social categories share one premium renderer and keep their own copy", () => {
  const catalogUrl = "https://orbit.boom-box.cl/catalogo/novios";
  for (const [category, intro] of [
    ["WEDDINGS", /cada recuerdo de su matrimonio/],
    ["BIRTHDAYS", /Cada cumpleaños merece celebrarse en grande/],
    ["GRADUATIONS", /alegría de tu graduación/],
  ] as const) {
    const html = buildSocialPlansEmail({
      category,
      body: quickSendInitialBody(category, "configuración antigua"),
      contact: "joaquín pérez",
      website: "https://www.bbox.cl",
      catalogUrl,
      attachmentFilename: "Planes y Valores BOOMBOX.pdf",
    }).html;
    assert.match(html, /EXPERIENCIAS QUE CONECTAN/);
    assert.match(html, /Hola Joaquín Pérez,/);
    assert.match(html, intro);
    assert.match(html, /TU COTIZACIÓN ESTÁ LISTA/);
    assert.match(html, /href="https:\/\/orbit\.boom-box\.cl\/catalogo\/novios\/document"[^>]*>VER COTIZACIÓN PDF</);
    assert.doesNotMatch(html, /¿QUIERES COTIZAR\?|Respóndenos indicando:|PDF ADJUNTO/);
    assert.match(html, /Un abrazo,<br><strong>Equipo BOOMBOX/);
    assert.match(html, /BOOMBOX · Comunicación emitida mediante ORBIT<br>ORBIT · Software desarrollado por BOOMBOX/);
    assert.match(html, /<a href="https:\/\/www\.bbox\.cl"[^>]*>www\.bbox\.cl<\/a>/);
    assert.ok(html.indexOf("Hola Joaquín Pérez") < html.indexOf("VER COTIZACIÓN PDF"));
    assert.ok(html.indexOf("VER COTIZACIÓN PDF") < html.indexOf("Un abrazo"));
  }
});

test("social renderer adapts proposal copy safely when delivery uses the certified link only", () => {
  const rendered = buildSocialPlansEmail({
    body: quickSendInitialBody("BIRTHDAYS", ""),
    contact: "Camila",
    website: "https://www.bbox.cl",
    catalogUrl: "https://orbit.boom-box.cl/catalogo/eventos",
  });
  assert.match(rendered.html, /Descubre los servicios, valores y todos los detalles en tu cotización PDF/);
  assert.doesNotMatch(rendered.html, /documento adjunto|PDF ADJUNTO/);
  assert.match(rendered.text, /VER COTIZACIÓN PDF: https:\/\/orbit\.boom-box\.cl\/catalogo\/eventos\/document/);
});

test("social premium HTML remains safe at Gmail mobile and contained on desktop", () => {
  const html = buildSocialPlansEmail({
    body: quickSendInitialBody("WEDDINGS", ""),
    contact: "Joaquín",
    website: "https://www.bbox.cl",
    catalogUrl: "https://orbit.boom-box.cl/catalogo/novios",
  }).html;
  assert.match(html, /name="viewport" content="width=device-width,initial-scale=1"/);
  assert.match(html, /padding:28px 12px/);
  assert.match(html, /width:100%;max-width:620px/);
  assert.match(html, /width:310px;max-width:100%/);
  assert.doesNotMatch(html, /width:\s*[7-9][0-9]{2}px/);
  assert.match(html, /@media only screen and \(max-width:420px\)\{\.orbit-quote-logo\{max-height:121px!important\}/);
  assert.match(html, /<a href="https:\/\/orbit\.boom-box\.cl\/catalogo\/novios\/document"[^>]*display:block/);
});

test("social redesign preserves recipients, optional PDF, idempotency, and Empresa branch", () => {
  const actions = source("features/commercial-hub/actions.ts");
  assert.match(actions, /to: input\.email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(actions, /attachments: downloaded\?\.data \?/);
  assert.match(actions, /idempotency_key: input\.requestId/);
  assert.match(actions, /input\.category === "COMPANIES_CATALOG"/);
  assert.match(actions, /buildSocialPlansEmail\(\{/);
});


test("formal quote and WhatsApp catalog use compact graphical signatures, while social plans use a text closing", () => {
  const formalQuote = source("features/commercial-hub/actions.ts");
  const whatsapp = source("features/connectors/whatsapp-cloud/whatsapp-catalog.delivery.ts");
  for (const sender of [formalQuote, whatsapp]) {
    assert.match(sender, /<img src="\$\{escapeHtml\(signatureUrl\)\}"[^>]*max-width:280px;[^"]*max-height:72px/);
    assert.doesNotMatch(sender, /<img src="\$\{escapeHtml\(signatureUrl\)\}"[^>]*max-width:(?:420|600)px/);
  }
  const html = buildSocialPlansEmail({
    body: quickSendInitialBody("WEDDINGS", ""),
    contact: "Joaquín",
    website: "https://www.bbox.cl",
    catalogUrl: "https://orbit.boom-box.cl/catalogo/novios",
    signatureUrl: "https://example.invalid/signature.gif",
  }).html;
  assert.match(html, /Un abrazo,<br><strong>Equipo BOOMBOX<\/strong>/);
  assert.doesNotMatch(html, /signature\.gif/);
});

test("catalog emails expose tax-specific transport CTA without mixing customer types", () => {
  const privateEmail = buildSocialPlansEmail({
    body: quickSendInitialBody("WEDDINGS", ""),
    contact: "Josefina",
    website: "https://www.bbox.cl",
    catalogUrl: "https://app.bbox.cl/catalogo/novios",
    attachmentFilename: "Planes y Valores BOOMBOX.pdf",
    transportUrl: "https://app.bbox.cl/traslados?type=private",
    transportLabel: "CONOCER VALOR DE TRASLADO",
  });
  assert.match(privateEmail.html, /CONOCER VALOR DE TRASLADO/);
  assert.match(privateEmail.html, /traslados\?type=private/);
  assert.doesNotMatch(privateEmail.html, /CONOCER VALOR DE TRASLADO \+ IVA/);

  const actions = source("features/commercial-hub/actions.ts");
  assert.match(actions, /input\.category === "COMPANIES_CATALOG"/);
  assert.match(actions, /CONOCER VALOR DE TRASLADO \+ IVA/);
  assert.match(actions, /CONOCER VALOR DE TRASLADO/);
  assert.match(actions, /buildSocialPlansEmail\(\{[^}]*catalogUrl: publicUrl,\s*transportUrl,\s*transportLabel,/);
});


test("premium customer email shell keeps readable spacing on mobile", () => {
  const html = renderBoomboxCommercialEmail({
    preheader: "Preview",
    eyebrow: "BOOMBOX",
    title: "Tu experiencia",
    contentHtml: "<p>Primer párrafo.</p><p>Segundo párrafo.</p>",
    website: "https://www.bbox.cl",
    primaryAction: { href: "https://app.bbox.cl/a", label: "ACCIÓN PRINCIPAL" },
    secondaryAction: { href: "https://app.bbox.cl/b", label: "ACCIÓN SECUNDARIA" },
  });
  assert.match(html, /\.orbit-body p\{margin-bottom:14px!important\}/);
  assert.match(html, /\.orbit-body \.orbit-signature p\{margin:0!important\}/);
  assert.match(html, /\.orbit-action\{width:100%!important/);
  assert.match(html, /\.orbit-action-link\{display:block!important;width:100%!important/);
  assert.match(html, /\.orbit-body\{padding:20px 18px!important/);
  assert.doesNotMatch(html, /min-width:260px/);
});
