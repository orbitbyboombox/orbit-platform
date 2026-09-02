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
      if (value === "BIENVENIDOS A BOOMBOX") return "";
      if (
        [
          "SERVICIO CONTRATADO",
          "INFORMACIÓN DEL EVENTO",
          "VALOR DEL SERVICIO CONTRATADO",
        ].includes(value)
      )
        return `<h2 style="margin:30px 0 14px;padding-top:18px;border-top:1px solid #eee;font-size:13px;letter-spacing:.12em;color:#e67800">${escapeHtml(value)}</h2>`;
      if (
        options.portalUrl &&
        value === "ABRIR EVENTO EN ORBIT"
      )
        return "";
      const [label, ...detail] = value.split("\n");
      if (
        detail.length &&
        [
          "Servicio",
          "Duración",
          "Extras",
          "Fecha",
          "Horario",
          "Lugar",
          "Valor total",
          "Abono recibido",
          "Saldo pendiente",
        ].includes(label)
      )
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 12px"><tr><td style="width:40%;padding-right:12px;color:#777;font-size:14px;vertical-align:top">${escapeHtml(label)}</td><td align="right" style="font-size:${label === "Valor total" ? "22px" : "15px"};font-weight:700;vertical-align:top">${escapeHtml(detail.join(" "))}</td></tr></table>`;
      return `<p style="margin:0 0 18px">${escapeHtml(value).replaceAll("\n", "<br>")}</p>`;
    })
    .join("");
  return renderBoomboxCommercialEmail({
    preheader: "Tu reserva BOOMBOX está confirmada.",
    eyebrow: "RESERVA CONFIRMADA",
    title: "BIENVENIDOS A BOOMBOX",
    contentHtml: paragraphs,
    website,
    primaryAction: options.portalUrl
      ? { href: options.portalUrl, label: "ABRIR EVENTO EN ORBIT" }
      : undefined,
    attachmentNote: options.companyCommercial
      ? "Tu documento comercial oficial se encuentra adjunto a este correo."
      : undefined,
  });
}
