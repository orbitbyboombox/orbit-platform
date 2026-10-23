import { renderBoomboxCommercialEmail } from "../connectors/google-gmail/application/boombox-commercial-email.html.ts";
import { buildSocialPlansEmail } from "./social-plans-email.ts";
import {
  QUICK_SEND_CTA_LABEL,
  commercialSignatureMode,
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
  if (input.category !== "COMPANIES_CATALOG") {
    return buildSocialPlansEmail({
      body: cleanBody,
      contact: input.contact,
      website: input.website,
      catalogUrl: input.catalogUrl,
      transportUrl: input.transportUrl,
      transportLabel: input.transportLabel,
      attachmentFilename: input.attachmentFilename,
      signatureUrl: input.signatureUrl,
    });
  }

  const signatureMode = commercialSignatureMode(input.signatureUrl ?? "");
  const signature = signatureMode === "GRAPHICAL"
    ? `<p style="margin:24px 0 0"><img src="${escapeHtml(input.signatureUrl ?? "")}" alt="BOOMBOX" style="display:block;max-width:420px;width:100%;height:auto;border:0"></p>`
    : `<p style="margin:8px 0 0"><strong>Equipo BOOMBOX</strong></p>`;
  const paragraphs = quickSendBodyParagraphs(cleanBody, input.contact);
  const renderParagraph = (paragraph: string) => {
    if (paragraph.replaceAll("**", "").trim() === "¿QUIERES COTIZAR?")
      return `<h2 style="margin:28px 0 12px;color:#d76d00;font-size:14px;letter-spacing:.1em">¿QUIERES COTIZAR?</h2>`;
    if (paragraph.startsWith("Respóndenos indicando:"))
      return `<div style="margin:0 0 18px;padding:16px 18px;background:#fff7eb;border:1px solid #f4d5aa;border-radius:12px">${richText(paragraph)}</div>`;
    if (paragraph.startsWith("**Importante:**"))
      return `<p style="margin:20px 0 0;padding:14px 16px;background:#f7f5f1;border-radius:10px;color:#5d574f;font-size:13px">${richText(paragraph)}</p>`;
    return `<p style="margin:0 0 16px">${richText(paragraph)}</p>`;
  };
  const html = renderBoomboxCommercialEmail({
    preheader: "Conoce los planes y experiencias BOOMBOX para tu evento.",
    eyebrow: "EXPERIENCIAS CORPORATIVAS",
    title: "Experiencias BOOMBOX para tu evento",
    contentHtml: paragraphs.map(renderParagraph).join(""),
    website: input.website,
    primaryAction: { href: input.catalogUrl, label: QUICK_SEND_CTA_LABEL },
    secondaryAction: { href: input.transportUrl, label: input.transportLabel },
    primaryActionFallback: "Si tienes problemas con el botón, puedes abrir los planes y valores",
    attachmentNote: input.attachmentFilename
      ? `${input.attachmentFilename} está incluido como archivo adjunto.`
      : undefined,
    signatureHtml: signature,
  });
  return {
    html,
    text: `${paragraphs.join("\n\n")}\n\n${QUICK_SEND_CTA_LABEL}: ${input.catalogUrl}\n\n${input.transportLabel}: ${input.transportUrl}\n\n${signatureMode === "GRAPHICAL" ? "" : "Equipo BOOMBOX"}`.trim(),
  };
}

export function commercialEmailTextBody(body: string, contact: string, category: string, catalogUrl: string, transportUrl: string, transportLabel: string, signatureUrl?: string) {
  if (category !== "COMPANIES_CATALOG") return undefined;
  const cleanBody = withoutDuplicateSignature(body, "Equipo BOOMBOX");
  const paragraphs = quickSendBodyParagraphs(cleanBody, contact);
  return `${paragraphs.join("\n\n")}\n\n${QUICK_SEND_CTA_LABEL}: ${catalogUrl}\n\n${transportLabel}: ${transportUrl}\n\n${signatureUrl ? "" : "Equipo BOOMBOX"}`.trim();
}
