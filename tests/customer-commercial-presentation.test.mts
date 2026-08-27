import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildReservationConfirmationTemplate } from "../features/connectors/google-gmail/application/reservation-confirmation.template.ts";
import { renderReservationConfirmationHtml } from "../features/connectors/google-gmail/application/reservation-confirmation.html.ts";
import {
  customerCommercialItemsFromSnapshot,
  customerCommercialItemsFromLegacyQuote,
  customerCommercialPresentation,
} from "../features/projects/reservation-presentation.ts";
import { createSignedAgreementPdf } from "../features/projects/signing/signed-agreement-pdf.ts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const confirmationService = source(
  "features/connectors/google-gmail/application/reservation-confirmation.service.ts",
);
const confirmationTemplate = source(
  "features/connectors/google-gmail/application/reservation-confirmation.template.ts",
);
const confirmationHtml = source(
  "features/connectors/google-gmail/application/reservation-confirmation.html.ts",
);
const manualPdf = source(
  "features/projects/signing/manual-reservation-formalization.service.ts",
);
const signedPdf = source(
  "features/projects/signing/digital-signature.service.ts",
);

const realItems = [
  {
    code: "CLASSIC",
    label: "Classic 3 horas 5x15cms",
    itemType: "SERVICE",
    total: 290_000,
  },
  {
    code: "UNLIMITED_MAGNETS",
    label: "Imanes ilimitados GRATIS",
    itemType: "SERVICE",
    total: 0,
  },
];

const commercial = (items = realItems) =>
  customerCommercialPresentation({
    serviceCodes: ["CLASSIC", "UNLIMITED_MAGNETS"],
    commercialItems: items,
    serviceStartAt: "2026-09-14T17:00:00Z",
    serviceEndAt: "2026-09-14T20:00:00Z",
    eventDurationHours: 3,
    serviceDurations: [3, 3],
  });

const emailInput = (items = realItems) => ({
  customer: { fullName: "Jenniffer Chavez", metadata: {} },
  eventName: "Evento corporativo de Fiestas Patrias",
  eventDate: "2026-09-14",
  eventTime: "14:00:00",
  venue: "Patio de la Sala de Arte, Av Vitacura 2680",
  city: "Las Condes",
  serviceCodes: ["CLASSIC", "UNLIMITED_MAGNETS"],
  commercialItems: items,
  serviceStartAt: "2026-09-14T17:00:00Z",
  serviceEndAt: "2026-09-14T20:00:00Z",
  eventDurationHours: 3,
  serviceDurations: [3, 3],
  transport: 0,
  total: 345_100,
  paid: 172_550,
  balance: 172_550,
  portalAvailable: true,
});

const companyEmailInput = (items = realItems) => ({
  ...emailInput(items),
  companyCommercial: true,
});

async function pdfText(pdf: Uint8Array) {
  const document = await getDocument({ data: Uint8Array.from(pdf) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .flatMap((item) => ("str" in item ? [item.str] : []))
        .join(" "),
    );
  }
  await document.destroy();
  return pages;
}

test("primary service is presented exactly once and extra is not a service", () => {
  const result = commercial();
  assert.equal(result.service, "Classic");
  assert.equal(result.serviceWithDuration, "Classic · 3 horas");
  assert.equal(result.extrasLabel, "Imanes ilimitados · Gratis");
  assert.doesNotMatch(result.service, /Imanes|UNLIMITED_MAGNETS/);
});

test("legacy SERVICE item is classified by the canonical extra catalog", () => {
  const parsed = customerCommercialItemsFromSnapshot({ items: realItems });
  const result = customerCommercialPresentation({
    serviceCodes: ["CLASSIC", "UNLIMITED_MAGNETS"],
    commercialItems: parsed,
    eventDurationHours: 3,
  });
  assert.equal(result.service, "Classic");
  assert.deepEqual(result.extras, ["Imanes ilimitados · Gratis"]);
});

test("legacy Empresa quote recovers magnets and excludes transport from extras", () => {
  const parsed = customerCommercialItemsFromLegacyQuote([
    { label: "CLASSIC", total: 290_000 },
    { label: "Imanes", total: 65_000 },
    { label: "Transporte", total: 0 },
  ]);
  const result = customerCommercialPresentation({
    serviceCodes: ["CLASSIC"],
    commercialItems: parsed,
    eventDurationHours: 3,
  });
  assert.equal(result.service, "Classic");
  assert.equal(result.extrasLabel, "Imanes ilimitados · $65.000");
  assert.doesNotMatch(result.extrasLabel, /Transporte/);
});

test("zero-price extra uses Gratis and never customer-facing $0", () => {
  const result = commercial();
  assert.match(result.extrasLabel, /Gratis/);
  assert.doesNotMatch(result.extrasLabel, /\$0/);
});

test("paid extra uses the canonical commercial label and formatted CLP", () => {
  const result = commercial([
    realItems[0],
    { ...realItems[1], total: 65_000 },
  ]);
  assert.equal(result.extrasLabel, "Imanes ilimitados · $65.000");
});

test("several extras remain grouped as extras", () => {
  const result = customerCommercialPresentation({
    serviceCodes: ["CLASSIC", "UNLIMITED_MAGNETS", "QR"],
    commercialItems: [
      realItems[0],
      realItems[1],
      { code: "QR", label: "QR", itemType: "EXTRA", total: 12_000 },
    ],
    eventDurationHours: 3,
  });
  assert.equal(result.service, "Classic");
  assert.equal(
    result.extrasLabel,
    "Imanes ilimitados · Gratis · QR corporativo · $12.000",
  );
});

test("no extra renders Sin extras", () => {
  const result = customerCommercialPresentation({
    serviceCodes: ["CLASSIC"],
    commercialItems: [realItems[0]],
    eventDurationHours: 3,
  });
  assert.equal(result.extrasLabel, "Sin extras");
});

test("email renders one service, classified extras and one canonical duration", () => {
  const rendered = buildReservationConfirmationTemplate(emailInput());
  assert.equal(rendered.services, "Classic");
  assert.equal(rendered.extras, "Imanes ilimitados · Gratis");
  assert.equal(rendered.duration, "3 horas");
  assert.match(rendered.body, /^Servicio: Classic · 3 horas$/m);
  assert.match(rendered.body, /^Extras: Imanes ilimitados · Gratis$/m);
  assert.doesNotMatch(rendered.body, /Servicio:.*\n\nServicio:/);
  assert.doesNotMatch(rendered.body, /UNLIMITED_MAGNETS|3 horas, 3 horas/);
});

test("email paid extra and transport keep their exact presentation", () => {
  const rendered = buildReservationConfirmationTemplate(
    emailInput([realItems[0], { ...realItems[1], total: 65_000 }]),
  );
  assert.match(rendered.body, /^Extras: Imanes ilimitados · \$65\.000$/m);
  assert.match(rendered.body, /^Transporte: \$0$/m);
  assert.match(rendered.body, /^Valor total: \$345\.100$/m);
  assert.match(rendered.body, /^Abono recibido: \$172\.550$/m);
  assert.match(rendered.body, /^Saldo pendiente: \$172\.550$/m);
});

test("Empresa email uses the dedicated reservation confirmation structure", () => {
  const rendered = buildReservationConfirmationTemplate(companyEmailInput());
  assert.match(rendered.body, /^Hola Jenniffer Chavez,$/m);
  assert.match(rendered.body, /^BIENVENIDOS A BOOMBOX$/m);
  assert.match(rendered.body, /^SERVICIO CONTRATADO$/m);
  assert.match(rendered.body, /^Servicio\nClassic$/m);
  assert.match(rendered.body, /^Duración\n3 horas$/m);
  assert.match(rendered.body, /^Extras\nImanes ilimitados · Gratis$/m);
  assert.match(rendered.body, /^INFORMACIÓN DEL EVENTO$/m);
  assert.match(rendered.body, /^Fecha\n14 de septiembre de 2026$/m);
  assert.match(rendered.body, /^Horario\n14:00$/m);
  assert.match(
    rendered.body,
    /^Lugar\nPatio de la Sala de Arte, Av Vitacura 2680, Las Condes$/m,
  );
});

test("Empresa email presents only the immutable contracted total", () => {
  const rendered = buildReservationConfirmationTemplate(companyEmailInput());
  assert.match(rendered.body, /VALOR DEL SERVICIO CONTRATADO\n\n\$345\.100/);
  assert.doesNotMatch(
    rendered.body,
    /Transporte:|Abono recibido:|Saldo pendiente:|Reserva\s+\$172\.550|\$165\.000/,
  );
});

test("Empresa CTA is branded, mobile friendly and targets safe portal login", () => {
  const rendered = buildReservationConfirmationTemplate(companyEmailInput());
  const html = renderReservationConfirmationHtml(
    rendered.body,
    "https://www.bbox.cl",
    {
      companyCommercial: true,
      portalUrl: "https://orbit.boom-box.cl/portal",
    },
  );
  assert.match(rendered.body, /^ABRIR EVENTO EN ORBIT$/m);
  assert.match(html, />ABRIR EVENTO EN ORBIT<\/a>/);
  assert.match(html, /href="https:\/\/orbit\.boom-box\.cl\/portal"/);
  assert.match(html, /background:#f78900/);
  assert.match(html, /min-width:260px/);
  assert.doesNotMatch(html, /\/projects\/|\/p\/|token=|access_token|[0-9a-f]{8}-[0-9a-f-]{27}/i);
});

test("Empresa omits CTA cleanly when safe portal access is unavailable", () => {
  const rendered = buildReservationConfirmationTemplate({
    ...companyEmailInput(),
    portalAvailable: false,
  });
  assert.doesNotMatch(rendered.body, /ABRIR EVENTO EN ORBIT/);
});

test("non-Empresa confirmation retains its existing financial summary", () => {
  const rendered = buildReservationConfirmationTemplate(emailInput());
  assert.match(rendered.body, /^Valor total: \$345\.100$/m);
  assert.match(rendered.body, /^Abono recibido: \$172\.550$/m);
  assert.match(rendered.body, /^Saldo pendiente: \$172\.550$/m);
  assert.doesNotMatch(rendered.body, /SERVICIO CONTRATADO|ABRIR EVENTO EN ORBIT/);
});

test("generated commercial PDF separates service hours and extras", async () => {
  const presentation = commercial();
  const pages = await pdfText(
    await createSignedAgreementPdf({
      quotationNumber: "2026-826",
      customer: "Jenniffer Chavez",
      customerRut: "90.413.000-1",
      customerEmail: "jfchave@ccu.cl",
      customerPhone: "+56 9 3194 6000",
      event: "Evento corporativo de Fiestas Patrias",
      eventDate: "2026-09-14",
      eventTime: "14:00",
      services: presentation.service,
      hours: presentation.duration,
      extras: presentation.extrasLabel,
      venue: "Patio de la Sala de Arte, Av Vitacura 2680",
      address: "Las Condes",
      operationalContact: "Equipo BOOMBOX",
      finalCustomerPrice: 345_100,
      agreementVersion: "RC-16",
      verificationCode: "SAFE-PREVIEW",
      portalUrl: "https://orbit.boom-box.cl/portal",
      documentMode: "COMMERCIAL_DOCUMENT",
      branding: {
        productName: "ORBIT",
        productVersion: "v1.0",
        brandName: "BOOMBOX",
        poweredBy: "NOVA CORE",
        footer: "Documento emitido por BOOMBOX mediante ORBIT.",
        currency: "CLP",
        locale: "es-CL",
        timezone: "America/Santiago",
      },
    }),
  );
  const commercialPage = pages.find((page) => page.includes("EXPERIENCIA CONTRATADA")) ?? "";
  assert.match(commercialPage, /SERVICIO\s+Classic/);
  assert.match(commercialPage, /HORAS\s+3 horas/);
  assert.match(commercialPage, /EXTRAS\s+Imanes ilimitados · Gratis/);
  assert.doesNotMatch(commercialPage, /UNLIMITED_MAGNETS|3 horas, 3 horas/);
});

test("generated PDF preserves the existing real commercial totals", async () => {
  const presentation = commercial();
  const pdf = await createSignedAgreementPdf({
    quotationNumber: "2026-826", customer: "Jenniffer Chavez", customerRut: "90.413.000-1", customerEmail: "jfchave@ccu.cl", customerPhone: "+56 9 3194 6000", event: "Evento corporativo", eventDate: "2026-09-14", eventTime: "14:00", services: presentation.service, hours: presentation.duration, extras: presentation.extrasLabel, venue: "Av Vitacura 2680", address: "Las Condes", operationalContact: "Equipo BOOMBOX", finalCustomerPrice: 345_100, companyCommercial: true, netAmount: 290_000, vatAmount: 55_100, depositPercent: 50, depositAmount: 172_550, balanceAmount: 172_550, agreementVersion: "RC-16", verificationCode: "SAFE-PREVIEW", portalUrl: "https://orbit.boom-box.cl/portal", documentMode: "COMMERCIAL_DOCUMENT", branding: { productName: "ORBIT", productVersion: "v1.0", brandName: "BOOMBOX", poweredBy: "NOVA CORE", footer: "Documento emitido por BOOMBOX mediante ORBIT.", currency: "CLP", locale: "es-CL", timezone: "America/Santiago" },
  });
  const text = (await pdfText(pdf)).join(" ");
  assert.match(text, /NETO\s+\$290\.000/);
  assert.match(text, /IVA 19%\s+\$55\.100/);
  assert.match(text, /PRECIO TOTAL\s+\$345\.100/);
  assert.match(text, /La reserva se confirma con un abono del 50% del valor total/);
  assert.doesNotMatch(text, /RESERVA 50%|SALDO RESTANTE/);
});

test("email and both PDF paths consume the one shared presentation model", () => {
  assert.match(confirmationTemplate, /customerCommercialPresentation/);
  assert.match(confirmationService, /customerCommercialItemsFromSnapshot/);
  for (const code of [manualPdf, signedPdf]) {
    assert.match(code, /customerCommercialPresentation/);
    assert.match(code, /customerCommercialItemsFromSnapshot/);
    assert.match(code, /accepted_snapshot/);
    assert.match(code, /project_operational_contracts\(service_start_at,service_end_at\)/);
  }
});

test("presentation repair never writes financial or collection truth", () => {
  const changed = `${confirmationTemplate}\n${manualPdf}\n${signedPdf}`;
  assert.doesNotMatch(changed, /from\("invoice_payments"\)|from\("accounts_receivable/);
  assert.doesNotMatch(changed, /paid_amount\s*:|outstanding_balance\s*:/);
  assert.doesNotMatch(changed, /transport_total\s*:/);
});

test("mobile email remains line-based and wrapped by the branded responsive shell", () => {
  const rendered = buildReservationConfirmationTemplate(emailInput());
  assert.ok(rendered.body.split("\n\n").every((line) => line.length < 180));
  assert.match(confirmationHtml, /max-width:620px/);
  assert.match(confirmationHtml, /overflow:hidden/);
  assert.match(confirmationHtml, /padding:28px 12px/);
});
