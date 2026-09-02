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
    return `<h2 style="margin:28px 0 12px;color:#d76d00;font-size:13px;line-height:1.4;letter-spacing:.14em">NUESTRA PROPUESTA</h2>`;
  if (paragraph.startsWith("**Importante:**"))
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;background:#f7f5f1;border-radius:12px"><tr><td style="padding:15px 17px;color:#5d574f;font-size:13px;line-height:1.55">${richText(paragraph)}</td></tr></table>`;
  return `<p style="margin:0 0 16px;font-size:${index === 0 ? "17px" : "15px"};line-height:1.65;${index === 0 ? "font-weight:700;" : ""}">${richText(paragraph)}</p>`;
};

export type SocialPlansEmailInput = {
  body: string;
  contact: string;
  website: string;
  catalogUrl: string;
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
  const postActionIndex = paragraphs.findIndex((paragraph) =>
    paragraph.startsWith("Si alguna alternativa te interesa,"),
  );
  const beforeAction = postActionIndex < 0 ? paragraphs : paragraphs.slice(0, postActionIndex);
  const afterAction = postActionIndex < 0 ? [] : paragraphs.slice(postActionIndex);
  const signatureHtml = input.signatureUrl
    ? `<p style="margin:8px 0 0"><img src="${escapeHtml(input.signatureUrl)}" alt="BOOMBOX" style="display:block;max-width:600px;width:100%;height:auto;border:0"></p>`
    : `<p style="margin:8px 0 0"><strong>Equipo BOOMBOX</strong></p>`;
  const html = renderBoomboxCommercialEmail({
    preheader: "Conoce las experiencias y valores BOOMBOX para tu celebración.",
    eyebrow: "",
    title: "",
    headerLabel: "EXPERIENCIAS PARA TU CELEBRACIÓN",
    stackedHeader: true,
    contentHtml: beforeAction.map(renderParagraph).join(""),
    contentAfterActionsHtml: afterAction.map((paragraph, index) => renderParagraph(paragraph, beforeAction.length + index)).join(""),
    website: input.website,
    primaryAction: { href: input.catalogUrl, label: QUICK_SEND_CTA_LABEL },
    primaryActionFallback: "Si tienes problemas con el botón, puedes abrir los planes y valores",
    attachmentNote: input.attachmentFilename
      ? `${input.attachmentFilename} está incluido como archivo adjunto.`
      : undefined,
    signatureHtml,
  });
  const text = [
    ...beforeAction,
    `${QUICK_SEND_CTA_LABEL}: ${input.catalogUrl}`,
    ...afterAction,
    input.signatureUrl ? "" : "Equipo BOOMBOX",
  ].filter(Boolean).join("\n\n");
  return { html, text };
}
