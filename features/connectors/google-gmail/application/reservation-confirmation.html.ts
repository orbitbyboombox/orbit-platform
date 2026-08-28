import { renderBoomboxCommercialEmail } from "./boombox-commercial-email.html.ts";

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

export function renderReservationConfirmationHtml(
  body: string,
  website: string,
  options: { companyCommercial: boolean; portalUrl?: string },
) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => {
      const value = paragraph.trim();
      if (options.companyCommercial && value === "BIENVENIDOS A BOOMBOX")
        return "";
      if (
        options.companyCommercial &&
        [
          "SERVICIO CONTRATADO",
          "INFORMACIÓN DEL EVENTO",
          "VALOR DEL SERVICIO CONTRATADO",
        ].includes(value)
      )
        return `<h2 style="margin:30px 0 14px;padding-top:18px;border-top:1px solid #eee;font-size:13px;letter-spacing:.12em;color:#e67800">${escapeHtml(value)}</h2>`;
      if (
        options.companyCommercial &&
        options.portalUrl &&
        value === "ABRIR EVENTO EN ORBIT"
      )
        return "";
      if (options.companyCommercial && /^\$[\d.]+$/.test(value))
        return `<p style="margin:0 0 20px;font-size:28px;font-weight:700">${escapeHtml(value)}</p>`;
      const [label, ...detail] = value.split("\n");
      if (
        options.companyCommercial &&
        detail.length &&
        ["Servicio", "Duración", "Extras", "Fecha", "Horario", "Lugar"].includes(label)
      )
        return `<div style="display:table;width:100%;margin:0 0 12px"><span style="display:table-cell;width:34%;padding-right:12px;color:#777">${escapeHtml(label)}</span><strong style="display:table-cell;text-align:right">${escapeHtml(detail.join(" "))}</strong></div>`;
      return `<p style="margin:0 0 18px">${escapeHtml(value).replaceAll("\n", "<br>")}</p>`;
    })
    .join("");
  if (options.companyCommercial) {
    return renderBoomboxCommercialEmail({
      preheader: "Tu reserva BOOMBOX está confirmada.",
      eyebrow: "RESERVA CONFIRMADA",
      title: "BIENVENIDOS A BOOMBOX",
      contentHtml: paragraphs,
      website,
      primaryAction: options.portalUrl
        ? { href: options.portalUrl, label: "ABRIR EVENTO EN ORBIT" }
        : undefined,
      attachmentNote:
        "Tu documento comercial oficial se encuentra adjunto a este correo.",
    });
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><main style="margin:0;background:#f6f4ef;padding:28px 12px;font-family:Arial,sans-serif;color:#171717;line-height:1.6"><section style="max-width:620px;margin:auto;overflow:hidden;border:1px solid #eadfce;border-radius:18px;background:#fff"><header style="background:#171717;padding:22px 28px;color:#fff"><strong style="font-size:22px;letter-spacing:.08em">BOOMBOX</strong></header><article style="padding:28px">${paragraphs}<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #eee;font-size:12px;color:#666"><a href="${escapeHtml(website)}" style="color:#e67800">${escapeHtml(website)}</a></p></article></section></main></body></html>`;
}
