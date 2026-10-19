import {
  QUICK_SEND_CTA_LABEL,
  quickSendBodyParagraphs,
  withoutDuplicateSignature,
} from "./presentation.ts";
import type { QuickSendCatalogCategory } from "./catalogs.ts";
import { renderBoomboxCommercialEmail } from "../connectors/google-gmail/application/boombox-commercial-email.html.ts";

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

const categoryPresentation = (category: QuickSendCatalogCategory) => {
  if (category === "WEDDINGS")
    return {
      eyebrow: "EXPERIENCIAS PARA TU MATRIMONIO",
      title: "Una propuesta pensada para tu matrimonio",
      preheader: "Conoce los planes y valores BOOMBOX para tu matrimonio.",
    };
  if (category === "BIRTHDAYS")
    return {
      eyebrow: "EXPERIENCIAS PARA TU CUMPLEAÑOS",
      title: "Una propuesta pensada para tu celebración",
      preheader: "Conoce los planes y valores BOOMBOX para tu cumpleaños.",
    };
  if (category === "COMPANIES_CATALOG")
    return {
      eyebrow: "EXPERIENCIAS PARA TU EVENTO",
      title: "Una propuesta pensada para tu marca",
      preheader: "Conoce las alternativas BOOMBOX para tu próximo evento.",
    };
  return {
    eyebrow: "EXPERIENCIAS PARA TU EVENTO",
    title: "Una propuesta pensada para tu celebración",
    preheader: "Conoce los planes y valores BOOMBOX para tu evento.",
  };
};

export type SocialPlansEmailInput = {
  category?: QuickSendCatalogCategory;
  body: string;
  contact: string;
  website: string;
  catalogUrl: string;
  attachmentFilename?: string;
  signatureUrl?: string;
  transportUrl?: string;
  transportLabel?: string;
};

export function buildSocialPlansEmail(input: SocialPlansEmailInput) {
  const category = input.category ?? "WEDDINGS";
  const presentation = categoryPresentation(category);
  const cleanBody = withoutDuplicateSignature(input.body, "Equipo BOOMBOX");
  const paragraphs = quickSendBodyParagraphs(cleanBody, input.contact);

  const proposalIndex = paragraphs.findIndex(
    (paragraph) => paragraph.replaceAll("**", "").trim() === "NUESTRA PROPUESTA",
  );
  const importantIndex = paragraphs.findIndex((paragraph) =>
    paragraph.startsWith("**Importante:**"),
  );

  const intro = paragraphs.slice(0, proposalIndex < 0 ? paragraphs.length : proposalIndex);
  const proposal =
    proposalIndex >= 0
      ? paragraphs.slice(
          proposalIndex + 1,
          importantIndex >= 0 ? importantIndex : paragraphs.length,
        )
      : [];
  const important =
    importantIndex >= 0 ? paragraphs[importantIndex] : "";
  const closing =
    importantIndex >= 0 ? paragraphs.slice(importantIndex + 1) : [];

  const proposalLead = proposal[0] ?? "";
  const proposalFollowup = proposal.slice(1).map(richText).join("<br><br>");
  const signatureHtml = input.signatureUrl
    ? `<p style="margin:18px 0 0"><img src="${escapeHtml(input.signatureUrl)}" alt="Firma BOOMBOX" width="280" style="display:block;width:auto;max-width:280px;height:auto;max-height:72px;border:0"></p>`
    : `<p style="margin:0;font-size:14px;line-height:1.55;color:#fff"><strong>Equipo BOOMBOX</strong></p>`;
  const contentHtml = `${intro.map((paragraph) => `<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#dedfe2">${richText(paragraph)}</p>`).join("")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;background:#121418;border:1px solid #2c2f34;border-radius:16px"><tr><td style="padding:20px"><p style="margin:0 0 12px;font-size:13px;line-height:1.4;letter-spacing:.16em;color:#f78900;font-weight:800">NUESTRA PROPUESTA</p>${proposalLead ? `<p style="margin:0;font-size:15px;line-height:1.65;color:#dedfe2">${richText(proposalLead)}</p>` : ""}<p style="margin:18px 0 0;font-size:14px;line-height:1.55;color:#d7d8db">Revisa los planes disponibles y consulta el valor de traslado según la comuna del evento.</p></td></tr></table>`;
  const contentAfterActionsHtml = `${proposalFollowup ? `<p style="margin:24px 0 0;font-size:15px;line-height:1.65;color:#dedfe2">${proposalFollowup}</p>` : ""}${important ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;background:#f5f2ed;border-radius:12px"><tr><td style="padding:15px 16px;color:#5c564f;font-size:13px;line-height:1.55">${richText(important)}</td></tr></table>` : ""}${closing.map((paragraph) => `<p style="margin:24px 0 0;font-size:15px;line-height:1.65;color:#dedfe2">${richText(paragraph)}</p>`).join("")}`;
  const html = renderBoomboxCommercialEmail({
    preheader: presentation.preheader,
    eyebrow: presentation.eyebrow,
    title: presentation.title,
    contentHtml,
    contentAfterActionsHtml,
    website: input.website,
    primaryAction: { href: input.catalogUrl, label: QUICK_SEND_CTA_LABEL },
    primaryActionFallback: "Si tienes problemas con el botón principal, puedes abrir los planes y valores",
    secondaryAction: input.transportUrl && input.transportLabel ? { href: input.transportUrl, label: input.transportLabel } : undefined,
    attachmentNote: input.attachmentFilename ? `PDF adjunto · ${input.attachmentFilename}` : undefined,
    signatureHtml,
  });

  const text = [
    presentation.eyebrow,
    presentation.title,
    ...intro,
    "NUESTRA PROPUESTA",
    ...proposal,
    `${QUICK_SEND_CTA_LABEL}: ${input.catalogUrl}`,
    ...(input.transportUrl && input.transportLabel
      ? [`${input.transportLabel}: ${input.transportUrl}`]
      : []),
    ...(important ? [important.replaceAll("**", "")] : []),
    ...closing,
    input.signatureUrl ? "" : "Equipo BOOMBOX",
  ].filter(Boolean).join("\n\n");

  return { html, text };
}
