import { renderPremiumQuotationEmail } from "../connectors/google-gmail/application/boombox-premium-quotation-email.html";

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
  contact: string;
  website: string;
  catalogUrl: string;
  transportUrl?: string;
  transportLabel?: string;
  attachmentFilename?: string;
  signatureUrl?: string;
};

export function buildSocialPlansEmail(input: SocialPlansEmailInput) {
  const person = input.contact.trim().toLocaleLowerCase("es-CL").replace(/(^|[\\s'-])([\\p{L}])/gu, (_, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase("es-CL"));
  const greeting = person ? `Hola ${person},` : "Hola,";
  const intro = /matrimonio/i.test(input.body)
    ? "Gracias por considerar a BOOMBOX para uno de los días más importantes de sus vidas. Preparamos una propuesta especial para que cada recuerdo de su matrimonio sea inolvidable."
    : /cumpleaños/i.test(input.body)
      ? "¡Cada cumpleaños merece celebrarse en grande! Preparamos experiencias fotográficas para compartir, reír y guardar los mejores recuerdos de tu celebración."
      : /graduaci[oó]n/i.test(input.body)
        ? "Después de tanto esfuerzo, llegó el momento de celebrar. Queremos acompañarte con una experiencia fotográfica que capture la alegría de tu graduación."
        : "Gracias por pensar en BOOMBOX. Queremos que tu evento se transforme en una experiencia memorable para ti y tus invitados.";
  const beforeAction = [greeting, intro];
  const afterAction: string[] = [];
  const signatureHtml = '<p style="margin:0">Un abrazo,<br><strong>Equipo BOOMBOX</strong></p>';
  const html = renderPremiumQuotationEmail({
    preheader: "Conoce las experiencias y valores BOOMBOX para tu celebración.",
    eyebrow: "",
    title: "",
    headerLabel: "EXPERIENCIAS PARA TU CELEBRACIÓN",
    stackedHeader: true,
    contentHtml: beforeAction.map(renderParagraph).join(""),
    contentAfterActionsHtml: afterAction.map((paragraph, index) => renderParagraph(paragraph, beforeAction.length + index)).join(""),
    website: input.website,
    primaryAction: { href: input.catalogUrl.replace(/\/$/, "") + "/document", label: "VER COTIZACIÓN PDF" },
    secondaryAction: input.transportUrl
      ? { href: input.transportUrl, label: input.transportLabel ?? "CONOCER VALOR DE TRASLADO" }
      : undefined,
    primaryActionFallback: "Si tienes problemas con el botón, puedes abrir los planes y valores",
    attachmentNote: input.attachmentFilename
      ? `${input.attachmentFilename} está incluido como archivo adjunto.`
      : undefined,
    signatureHtml,
  });
  const text = [
    ...beforeAction,
    `VER COTIZACIÓN PDF: ${input.catalogUrl.replace(/\/$/, "")}/document`,
    ...(input.transportUrl ? [`${input.transportLabel ?? "CONOCER VALOR DE TRASLADO"}: ${input.transportUrl}`] : []),
    ...afterAction,
    "Un abrazo, Equipo BOOMBOX",
  ].filter(Boolean).join("\n\n");
  return { html, text };
}
