import { OFFICIAL_BOOMBOX_LOGO_URL } from "../connectors/google-gmail/application/boombox-commercial-email.html.ts";
import {
  QUICK_SEND_CTA_LABEL,
  quickSendBodyParagraphs,
  withoutDuplicateSignature,
} from "./presentation.ts";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);

const richText = (paragraph: string) =>
  paragraph
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part) => part.startsWith("**") && part.endsWith("**")
      ? `<strong>${escapeHtml(part.slice(2, -2))}</strong>`
      : escapeHtml(part))
    .join("")
    .replaceAll("\n", "<br>");

type Input = {
  category: string;
  body: string;
  contact: string;
  website: string;
  catalogUrl: string;
  transportUrl: string;
  transportLabel: string;
  attachmentFilename?: string;
  signatureUrl?: string;
};

export function buildCommercialInformationEmail(input: Input) {
  const cleanBody = withoutDuplicateSignature(input.body, "Equipo BOOMBOX");
  const paragraphs = quickSendBodyParagraphs(cleanBody, input.contact).filter(isCatalogBodyParagraph);
  const labels: Record<string, string> = {
    WEDDINGS: "EXPERIENCIAS PARA MATRIMONIOS",
    BIRTHDAYS: "EXPERIENCIAS PARA CUMPLEAÑOS",
    GRADUATIONS: "EXPERIENCIAS PARA GRADUACIONES",
    COMPANIES_CATALOG: "EXPERIENCIAS CORPORATIVAS",
  };
  const proposalIndex = paragraphs.findIndex((paragraph) => paragraph.replaceAll("*", "").trim() === "NUESTRA PROPUESTA");
  const intro = (proposalIndex < 0 ? paragraphs : paragraphs.slice(0, proposalIndex))
    .map((paragraph, index) => renderCatalogParagraph(paragraph, index === 0))
    .join("");
  const closing = (proposalIndex < 0 ? [] : paragraphs.slice(proposalIndex + 1))
    .filter((paragraph) => !paragraph.startsWith("Cuando encuentres una alternativa"))
    .map((paragraph) => renderCatalogParagraph(paragraph, false))
    .join("");
  const attachment = input.attachmentFilename
    ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#6b7280">Adjunto: ${escapeHtml(input.attachmentFilename)}</p>`
    : "";
  const button = (href: string, label: string, filled = true) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;border-collapse:separate"><tr><td align="center" bgcolor="${filled ? "#ed7203" : "#ffffff"}" style="border:1px solid #ed7203;border-radius:12px;background-color:${filled ? "#ed7203" : "#ffffff"};padding:14px 24px;mso-padding-alt:14px 24px"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;letter-spacing:.03em;line-height:20px;color:${filled ? "#ffffff" : "#d85f00"};text-decoration:none;white-space:nowrap">${escapeHtml(label)}</a></td></tr></table>`;
  const card = (title: string, description: string, action: string, href: string, filled: boolean, extra = "") => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:26px 0;border:1px solid #f1c99f;border-radius:16px;background-color:#fff9f2;background:#fff9f2"><tr><td style="padding:22px"><h2 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:23px;color:#17191f">${title}</h2><p style="margin:8px 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#333740">${description}</p>${button(href, action, filled)}${extra}</td></tr></table>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head><body style="margin:0;padding:0;background-color:#f4f5f7;background:#f4f5f7"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f4f5f7;background:#f4f5f7"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:620px;border:1px solid #e3e5e9;border-radius:20px;background-color:#ffffff;background:#ffffff;border-collapse:separate;overflow:hidden"><tr><td style="padding:25px 28px;border-bottom:4px solid #f78900;background-color:#101216;background:#101216"><img src="${OFFICIAL_BOOMBOX_LOGO_URL}" alt="BOOMBOX®" width="270" style="display:block;width:270px;max-width:100%;height:auto;border:0"><p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;letter-spacing:.12em;color:#f6a452;text-transform:uppercase">${escapeHtml(labels[input.category] ?? "EXPERIENCIAS BOOMBOX")}</p></td></tr><tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;color:#17191f"><p style="margin:0 0 18px;font-size:18px;font-weight:700;line-height:26px;color:#17191f">Hola ${escapeHtml(input.contact.trim() || "Cliente")},</p>${intro}${card("Conoce nuestras experiencias BOOMBOX", "Revisa nuestras alternativas, formatos y valores para elegir la experiencia que mejor se adapte a tu evento.", QUICK_SEND_CTA_LABEL, input.catalogUrl, true, attachment)}${card("Conoce el valor de traslado", "Selecciona la comuna donde se realizará tu evento y consulta el valor de traslado correspondiente.", "CONSULTAR VALOR DE TRASLADO", input.transportUrl, false)}${closing}<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:#333740">Si tienes dudas o necesitas más información, estaremos encantados de ayudarte.</p><p style="margin:0;font-size:15px;line-height:23px;color:#333740">Esperamos ser parte de tu celebración.<br><br>Un abrazo,<br><strong>Equipo BOOMBOX®</strong></p><p style="margin:16px 0 0;padding-top:14px;border-top:1px solid #eceef2;font-size:12px;line-height:19px;color:#7a808b">Las fechas están sujetas a disponibilidad y se confirman mediante reserva.<br><a href="https://www.boom-box.cl/" style="color:#d85f00;text-decoration:none">www.boom-box.cl</a></p></td></tr></table></td></tr></table></body></html>`;
  return {
    html,
    text: `${paragraphs.join("\n\n")}\n\n${QUICK_SEND_CTA_LABEL}: ${input.catalogUrl}\n\nCONSULTAR VALOR DE TRASLADO: ${input.transportUrl}\n\nSi tienes dudas o necesitas más información, estaremos encantados de ayudarte.\n\nEsperamos ser parte de tu celebración.\n\nUn abrazo,\nEquipo BOOMBOX®\n\nLas fechas están sujetas a disponibilidad y se confirman mediante reserva.\nhttps://www.boom-box.cl/`.trim(),
  };
}

function isCatalogBodyParagraph(paragraph: string) {
  const normalized = paragraph.replaceAll("*", "").trim();
  return !/^Hola(?:\s|,)/i.test(normalized)
    && !normalized.startsWith("Cuando encuentres una alternativa")
    && !normalized.startsWith("Quedamos atentos")
    && !normalized.startsWith("Importante:")
    && !normalized.startsWith("Las fechas se confirman mediante reserva")
    && !normalized.startsWith("Esperamos ser parte")
    && normalized !== "Un abrazo,"
    && normalized !== "Equipo BOOMBOX";
}

function renderCatalogParagraph(paragraph: string, greeting: boolean) {
  const content = richText(paragraph);
  return `<p style="margin:0 0 14px;font-size:${greeting ? "17px" : "15px"};line-height:1.6;color:#333740${greeting ? ";font-weight:700" : ""}">${content}</p>`;
}

export function commercialEmailTextBody(body: string, contact: string, category: string, catalogUrl: string, transportUrl: string, transportLabel: string) {
  if (category !== "COMPANIES_CATALOG") return undefined;
  const cleanBody = withoutDuplicateSignature(body, "Equipo BOOMBOX");
  const paragraphs = quickSendBodyParagraphs(cleanBody, contact).filter(isCatalogBodyParagraph);
  return `${paragraphs.join("\n\n")}\n\n${QUICK_SEND_CTA_LABEL}: ${catalogUrl}\n\n${transportLabel}: ${transportUrl}\n\nSi tienes dudas o necesitas más información, estaremos encantados de ayudarte.\n\nEsperamos ser parte de tu celebración.\n\nUn abrazo,\nEquipo BOOMBOX®\n\nLas fechas están sujetas a disponibilidad y se confirman mediante reserva.\nhttps://www.boom-box.cl/`.trim();
}
