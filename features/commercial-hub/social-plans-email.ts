import {
  QUICK_SEND_CTA_LABEL,
  quickSendBodyParagraphs,
  withoutDuplicateSignature,
} from "./presentation.ts";
import type { QuickSendCatalogCategory } from "./catalogs.ts";

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
  const logoUrl = "https://app.bbox.cl/branding/boombox-official-logo.png";
  const signatureHtml = input.signatureUrl
    ? `<div class="orbit-signature"><img src="${escapeHtml(input.signatureUrl)}" alt="Firma BOOMBOX"></div>`
    : `<p style="margin:0;font-size:14px;line-height:1.55;color:#fff"><strong>Equipo BOOMBOX</strong></p>`;

  const attachment = input.attachmentFilename
    ? `<div class="orbit-attachment">PDF adjunto · ${escapeHtml(input.attachmentFilename)}</div>`
    : "";

  const transport = input.transportUrl && input.transportLabel
    ? `<a class="orbit-btn orbit-btn-secondary" href="${escapeHtml(input.transportUrl)}">${escapeHtml(input.transportLabel)}</a>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}
body{margin:0;padding:0;background:#ece9e3;font-family:Arial,Helvetica,sans-serif}
.orbit-shell{padding:28px 12px 44px}
.orbit-card{width:100%;max-width:620px;margin:0 auto;background:#0b0c0e;border:1px solid #32343a;border-radius:22px;overflow:hidden}
.orbit-accent{height:6px;background:#f78900}
.orbit-header{padding:26px 28px 22px;text-align:center;background:#111214}
.orbit-logo{display:block;width:220px;max-width:100%;height:auto;margin:0 auto -28px}
.orbit-strap{margin-top:0;font-size:10px;letter-spacing:.18em;color:#f78900;font-weight:700}
.orbit-body{padding:34px 30px 30px;color:#ececee}
.orbit-eyebrow{margin:0 0 12px;font-size:11px;letter-spacing:.18em;color:#f78900;font-weight:800}
.orbit-title{margin:0 0 24px;font-size:36px;line-height:1.08;letter-spacing:-.03em;color:#fff}
.orbit-copy{margin:0 0 18px;font-size:15px;line-height:1.65;color:#dedfe2}
.orbit-section{margin-top:34px}
.orbit-section-title{margin:0 0 12px;font-size:13px;letter-spacing:.16em;color:#f78900;font-weight:800}
.orbit-action-box{margin-top:20px;padding:20px;border:1px solid #2c2f34;border-radius:16px;background:#121418}
.orbit-action-intro{margin:0 0 16px;font-size:14px;line-height:1.55;color:#d7d8db;text-align:center}
.orbit-btn{display:block;width:100%;padding:14px 16px;border-radius:11px;text-decoration:none;text-align:center;font-size:13px;line-height:1.3;font-weight:800;letter-spacing:.035em}
.orbit-btn-primary{background:#f78900;color:#151515}
.orbit-btn-secondary{margin-top:12px;background:#fff;color:#171717;border:1px solid #d6d0c7}
.orbit-fallback{margin:11px 0 0;text-align:center;font-size:11px;line-height:1.45;color:#7d7871}
.orbit-fallback a{color:#f78900}
.orbit-attachment{margin-top:12px;text-align:center;font-size:10px;line-height:1.45;color:#777a80}
.orbit-followup{margin-top:26px;padding-top:24px;border-top:1px solid #2c2f34}
.orbit-important{margin-top:22px;padding:15px 16px;background:#f5f2ed;border-radius:12px;color:#5c564f;font-size:13px;line-height:1.55}
.orbit-important strong{color:#3f3a35}
.orbit-closing{margin-top:30px;padding-top:24px;border-top:1px solid #2c2f34}
.orbit-signature{margin-top:18px;text-align:left}
.orbit-signature img{display:block;width:100%;max-width:360px;height:auto;margin:0}
.orbit-footer{margin-top:28px;padding-top:20px;border-top:1px solid #2c2f34}
.orbit-footer-table{width:100%}
.orbit-footer-main{font-size:12px;line-height:1.65;color:#a7a9ae}
.orbit-footer-main a{color:#f78900;font-size:13px}
.orbit-footer-tag{text-align:right;font-size:9px;line-height:1.7;letter-spacing:.15em;color:#8e9095}
.orbit-software{margin-top:14px;font-size:9px;line-height:1.5;letter-spacing:.07em;color:#64666b}
@media only screen and (max-width:520px){
  .orbit-shell{padding:8px 5px 26px!important}
  .orbit-card{border-radius:15px!important}
  .orbit-header{padding:22px 18px 18px!important}
  .orbit-logo{width:188px!important;margin-bottom:-24px!important}
  .orbit-strap{margin-top:0!important;font-size:9px!important}
  .orbit-body{padding:26px 18px 24px!important}
  .orbit-eyebrow{margin-bottom:11px!important;font-size:10px!important}
  .orbit-title{font-size:29px!important;margin-bottom:22px!important}
  .orbit-copy{font-size:14px!important;line-height:1.62!important;margin-bottom:17px!important}
  .orbit-section{margin-top:30px!important}
  .orbit-section-title{font-size:12px!important;margin-bottom:11px!important}
  .orbit-action-box{margin-top:17px!important;padding:16px!important;border-radius:14px!important}
  .orbit-action-intro{font-size:13px!important;margin-bottom:14px!important}
  .orbit-btn{padding:13px 12px!important;font-size:12px!important}
  .orbit-btn-secondary{margin-top:10px!important}
  .orbit-fallback{margin-top:10px!important;font-size:10px!important}
  .orbit-followup{margin-top:22px!important;padding-top:21px!important}
  .orbit-important{margin-top:19px!important;padding:14px!important;font-size:12px!important}
  .orbit-closing{margin-top:25px!important;padding-top:21px!important}
  .orbit-signature{margin-top:15px!important}
  .orbit-signature img{max-width:290px!important}
  .orbit-footer{margin-top:24px!important;padding-top:18px!important}
  .orbit-footer-main,.orbit-footer-tag{display:block!important;width:100%!important;text-align:left!important}
  .orbit-footer-tag{padding-top:12px!important}
  .orbit-software{font-size:8.5px!important}
}
</style></head><body><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(presentation.preheader)}</div><main class="orbit-shell"><section class="orbit-card"><div class="orbit-accent"></div><header class="orbit-header"><img class="orbit-logo" src="${logoUrl}" alt="BOOMBOX®"><div class="orbit-strap">EXPERIENCIAS QUE CONECTAN</div></header><div class="orbit-body"><div class="orbit-eyebrow">${escapeHtml(presentation.eyebrow)}</div><h1 class="orbit-title">${escapeHtml(presentation.title)}</h1>${intro.map((paragraph) => `<p class="orbit-copy">${richText(paragraph)}</p>`).join("")}<section class="orbit-section"><div class="orbit-section-title">NUESTRA PROPUESTA</div>${proposalLead ? `<p class="orbit-copy">${richText(proposalLead)}</p>` : ""}<div class="orbit-action-box"><p class="orbit-action-intro">Revisa los planes disponibles y consulta el valor de traslado según la comuna del evento.</p><a class="orbit-btn orbit-btn-primary" href="${escapeHtml(input.catalogUrl)}">${QUICK_SEND_CTA_LABEL}</a>${transport}<p class="orbit-fallback">Si tienes problemas con el botón principal, puedes abrir los planes y valores <a href="${escapeHtml(input.catalogUrl)}">aquí</a>.</p>${attachment}</div></section><section class="orbit-followup">${proposalFollowup ? `<p class="orbit-copy">${proposalFollowup}</p>` : ""}${important ? `<div class="orbit-important">${richText(important)}</div>` : ""}</section><section class="orbit-closing">${closing.map((paragraph) => `<p class="orbit-copy">${richText(paragraph)}</p>`).join("")}${signatureHtml}</section><footer class="orbit-footer"><table class="orbit-footer-table" role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="orbit-footer-main"><a href="https://www.bbox.cl">www.bbox.cl</a><br>BOOMBOX · Santiago, Chile</td><td class="orbit-footer-tag">EXPERIENCIAS<br>RECUERDOS<br>MOMENTOS</td></tr></table><div class="orbit-software">COMUNICACIÓN EMITIDA MEDIANTE ORBIT SOFTWARE DESARROLLADO POR BOOMBOX®</div></footer></div></section></main></body></html>`;

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
