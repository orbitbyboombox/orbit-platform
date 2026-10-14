import { renderBoomboxCommercialEmail } from "../connectors/google-gmail/application/boombox-commercial-email.html.ts";
import {
  QUICK_SEND_CTA_LABEL,
  quickSendBodyParagraphs,
  withoutDuplicateSignature,
} from "./presentation.ts";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

const richText = (paragraph: string) =>
  paragraph
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**")
        ? `<strong>${escapeHtml(part.slice(2, -2))}</strong>`
        : escapeHtml(part),
    )
    .join("")
    .replaceAll("\n", "<br>");

const renderParagraph = (paragraph: string, index: number) => {
  const plain = paragraph.replaceAll("**", "").trim();
  if (plain === "NUESTRA PROPUESTA")
    return `<h2 style="margin:22px 0 10px;color:#f78900;font-size:13px;line-height:1.4;letter-spacing:.14em">NUESTRA PROPUESTA</h2>`;
  if (paragraph.startsWith("**Importante:**"))
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;background:#202124;border-radius:12px"><tr><td style="padding:15px 17px;color:#ffffff;font-size:13px;line-height:1.55">${richText(paragraph)}</td></tr></table>`;
  return `<p style="margin:0 0 14px;font-size:${index === 0 ? "17px" : "15px"};line-height:1.65;${index === 0 ? "font-weight:700;" : ""}">${richText(paragraph)}</p>`;
};

export type SocialPlansEmailInput = {
  body: string;
  category?: "WEDDINGS" | "BIRTHDAYS" | "GRADUATIONS" | "COMPANIES_CATALOG";
  contact: string;
  website: string;
  catalogUrl: string;
  transportUrl?: string;
  transportLabel?: string;
  attachmentFilename?: string;
  signatureUrl?: string;
};

export function buildSocialPlansEmail(input: SocialPlansEmailInput) {
  const cleanBody = withoutDuplicateSignature(input.body, "Equipo BOOMBOX");
  const paragraphs = quickSendBodyParagraphs(cleanBody, input.contact).map((paragraph) =>
    !input.attachmentFilename && paragraph === "Encontrarás el detalle completo de nuestras experiencias y valores en el documento adjunto."
      ? "Encontrarás el detalle completo de nuestras experiencias y valores al abrir Planes y Valores."
      : paragraph,
  );
  // Short commercial email: the catalog contains the detailed descriptions and prices.
  // Keep the configured greeting, but avoid repeating the proposal and CTA copy.
  const greeting = paragraphs.find((paragraph) => /^Hola[,\\s]/i.test(paragraph)) ?? "Hola,";
  const isCompany = input.category === "COMPANIES_CATALOG";
  const beforeAction = [
    greeting,
    "Gracias por considerar a BOOMBOX para ser parte de tu celebración.",
    "Con 16 años de experiencia en fotografía instantánea en Chile, fuimos pioneros en crear el concepto de tótem de fotos.",
    "NUESTRA PROPUESTA",
  ];
  const afterAction = [
    "Esperamos ser parte de tu celebración. Si tienes preguntas, responde este correo y te ayudaremos.",
    "**Importante:** La fecha se confirma al realizar la reserva.",
    "Un abrazo,",
  ];
  const catalogLabel = isCompany ? "VER PDF EMPRESAS" : input.category === "WEDDINGS" ? "VER PDF MATRIMONIOS" : "VER PDF EVENTOS";
  const signatureHtml = input.signatureUrl
    ? `<p style="margin:0"><img src="${escapeHtml(input.signatureUrl)}" alt="BOOMBOX" style="display:block;max-width:420px;width:100%;height:auto;border:0"></p>`
    : `<p style="margin:0"><strong>Equipo BOOMBOX</strong></p>`;
  const html = renderBoomboxCommercialEmail({
    preheader: "Conoce las experiencias y valores BOOMBOX para tu celebración.",
    eyebrow: "",
    title: "Conoce las experiencias BOOMBOX para tu evento",
    headerLabel: isCompany ? "EMPRESAS · PROPUESTA COMERCIAL" : "EXPERIENCIAS PARA TU CELEBRACIÓN",
    stackedHeader: true,
    contentHtml: beforeAction.map(renderParagraph).join(""),
    contentAfterActionsHtml: `<div style="margin-top:20px">` + afterAction.map((paragraph, index) => renderParagraph(paragraph, beforeAction.length + index)).join("") + `</div>`,
    website: input.website,
    primaryAction: { href: input.catalogUrl, label: catalogLabel },
    secondaryAction: input.transportUrl
      ? { href: input.transportUrl, label: input.transportLabel ?? "CONOCER VALOR DE TRASLADO" }
      : undefined,
    primaryActionFallback: undefined,
    attachmentNote: input.attachmentFilename
      ? `${input.attachmentFilename} está incluido como archivo adjunto.`
      : undefined,
    signatureHtml,
  });
  const text = [
    ...beforeAction,
    `${catalogLabel}: ${input.catalogUrl}`,
    ...(input.transportUrl ? [`${input.transportLabel ?? "CONOCER VALOR DE TRASLADO"}: ${input.transportUrl}`] : []),
    ...afterAction,
    input.signatureUrl ? "" : "Equipo BOOMBOX",
  ].filter(Boolean).join("\n\n");
  return { html, text };
}
