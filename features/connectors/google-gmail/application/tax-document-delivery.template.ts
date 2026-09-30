import { renderBoomboxCommercialEmail } from "./boombox-commercial-email.html";

export const TAX_DOCUMENT_DELIVERY_TYPE = "TAX_DOCUMENT_DELIVERY";
export const TAX_DOCUMENT_DELIVERY_RENDERER_VERSION = "TAX_DOCUMENT_DELIVERY_V1";

export type TaxDocumentDeliveryModel = {
  customerName: string;
  eventName: string;
  eventDate: string;
  taxType: string;
  folio: string;
  issueDate: string;
  total: number;
  website: string;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);

export const taxTypeLabel = (value: string) =>
  ({
    FACTURA: "Factura",
    BOLETA: "Boleta",
    NOTA_CREDITO: "Nota de crédito",
    NOTA_DEBITO: "Nota de débito",
  })[value] ?? value.replaceAll("_", " ");

export const formatTaxDocumentMoney = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

export const formatTaxDocumentDate = (value: string) =>
  new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));

export function defaultTaxDocumentDeliverySubject(model: TaxDocumentDeliveryModel) {
  return `${taxTypeLabel(model.taxType)} N° ${model.folio} · BOOMBOX`;
}

export function taxDocumentDeliveryFingerprint(model: TaxDocumentDeliveryModel) {
  return JSON.stringify({
    rendererVersion: TAX_DOCUMENT_DELIVERY_RENDERER_VERSION,
    customerName: model.customerName,
    eventName: model.eventName,
    eventDate: model.eventDate,
    taxType: model.taxType,
    folio: model.folio,
    issueDate: model.issueDate,
    total: model.total,
  });
}

export function buildTaxDocumentDeliveryText(model: TaxDocumentDeliveryModel) {
  return [
    `Hola ${model.customerName},`,
    "",
    "Adjuntamos el documento tributario correspondiente a tu evento BOOMBOX.",
    "",
    `Evento: ${model.eventName}`,
    `Fecha del evento: ${formatTaxDocumentDate(model.eventDate)}`,
    `Documento: ${taxTypeLabel(model.taxType)} N° ${model.folio}`,
    `Fecha de emisión: ${formatTaxDocumentDate(model.issueDate)}`,
    `Total: ${formatTaxDocumentMoney(model.total)}`,
    "",
    "El documento PDF va adjunto a este correo.",
    "Si tienes alguna duda, responde directamente este email.",
    "",
    "Equipo BOOMBOX",
  ].join("\n");
}

export function renderTaxDocumentDeliveryHtml(model: TaxDocumentDeliveryModel) {
  const content = `
    <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#e9e9ea">Hola <strong>${escapeHtml(model.customerName)}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#d8d8da">Adjuntamos el <strong>documento tributario</strong> correspondiente a tu evento BOOMBOX.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 24px;border:1px solid #343538;border-radius:16px;overflow:hidden">
      <tr><td style="padding:18px 20px;border-bottom:1px solid #343538;color:#aeb0b4;font-size:12px">EVENTO</td><td align="right" style="padding:18px 20px;border-bottom:1px solid #343538;color:#fff;font-size:14px;font-weight:700">${escapeHtml(model.eventName)}</td></tr>
      <tr><td style="padding:18px 20px;border-bottom:1px solid #343538;color:#aeb0b4;font-size:12px">FECHA</td><td align="right" style="padding:18px 20px;border-bottom:1px solid #343538;color:#fff;font-size:14px;font-weight:700">${escapeHtml(formatTaxDocumentDate(model.eventDate))}</td></tr>
      <tr><td style="padding:18px 20px;border-bottom:1px solid #343538;color:#aeb0b4;font-size:12px">DOCUMENTO</td><td align="right" style="padding:18px 20px;border-bottom:1px solid #343538;color:#fff;font-size:14px;font-weight:700">${escapeHtml(taxTypeLabel(model.taxType))} N° ${escapeHtml(model.folio)}</td></tr>
      <tr><td style="padding:18px 20px;border-bottom:1px solid #343538;color:#aeb0b4;font-size:12px">EMISIÓN</td><td align="right" style="padding:18px 20px;border-bottom:1px solid #343538;color:#fff;font-size:14px;font-weight:700">${escapeHtml(formatTaxDocumentDate(model.issueDate))}</td></tr>
      <tr><td style="padding:18px 20px;color:#aeb0b4;font-size:12px">TOTAL</td><td align="right" style="padding:18px 20px;color:#f78900;font-size:24px;font-weight:800">${escapeHtml(formatTaxDocumentMoney(model.total))}</td></tr>
    </table>
    <p style="margin:0;font-size:14px;line-height:1.65;color:#d8d8da">Encontrarás el documento adjunto en este correo. Si necesitas revisar algún dato, responde directamente a este mensaje.</p>
  `;

  return renderBoomboxCommercialEmail({
    preheader: `${taxTypeLabel(model.taxType)} N° ${model.folio} · Documento tributario BOOMBOX`,
    eyebrow: "DOCUMENTO TRIBUTARIO",
    title: "DOCUMENTO TRIBUTARIO",
    headerLabel: "BOOMBOX · CLIENTE",
    contentHtml: content,
    attachmentNote: `${taxTypeLabel(model.taxType)} N° ${model.folio} · ${formatTaxDocumentMoney(model.total)}`,
    closingLine: "Gracias por confiar en BOOMBOX.",
    website: model.website,
    stackedHeader: true,
    fixedLayout: true,
  });
}
